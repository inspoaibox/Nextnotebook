package com.mucheng.notes.data.cloud

import android.content.Context
import android.content.SharedPreferences
import androidx.documentfile.provider.DocumentFile
import com.mucheng.notes.data.local.dao.CloudFileLocalPathDao
import com.mucheng.notes.data.local.dao.ItemDao
import com.mucheng.notes.data.local.entity.ItemEntity
import com.mucheng.notes.domain.model.ItemType
import com.mucheng.notes.domain.model.payload.CloudFilePayload
import com.mucheng.notes.domain.model.payload.CloudFolderPayload
import com.mucheng.notes.domain.model.payload.CloudDownloadState
import com.mucheng.notes.domain.model.payload.CloudUploadState
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.security.MessageDigest
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.math.abs

data class CloudDriveScanResult(
    val scannedFiles: Int = 0,
    val scannedFolders: Int = 0,
    val createdOrUpdated: Int = 0,
    val deleted: Int = 0,
    val skipped: Int = 0,
    val error: String? = null,
) {
    val changed: Int
        get() = createdOrUpdated + deleted
}

/**
 * Recursively scans the Android SAF cloud-drive directory and reconciles it
 * into cloud_file / cloud_folder metadata.
 *
 * SAF does not provide reliable filesystem events for every provider, so this
 * scanner is the authoritative Android-side "directory watcher" fallback.
 */
@Singleton
class CloudDriveDirectoryScanner @Inject constructor(
    @ApplicationContext private val context: Context,
    private val configStore: CloudDriveConfigStore,
    private val folderPicker: CloudDriveFolderPicker,
    private val itemDao: ItemDao,
    private val localPathDao: CloudFileLocalPathDao,
) {
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
        isLenient = true
        coerceInputValues = true
    }

    private val prefs: SharedPreferences by lazy {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
    }

    suspend fun scanAndReconcile(): CloudDriveScanResult = withContext(Dispatchers.IO) {
        val cfg = configStore.current
        val root = folderPicker.resolveRootDocumentFile()
            ?: return@withContext CloudDriveScanResult(error = "网盘目录未授权或不可访问")

        val currentEntries = linkedSetOf<String>()
        val stats = MutableStats()
        val existingPathIndex = buildExistingPathIndex()
        val previousEntries = loadSnapshot()

        try {
            walk(root, "", currentEntries, stats, existingPathIndex, previousEntries, depth = 0)
            val deleted = reconcileDeleted(currentEntries, previousEntries)
            saveSnapshot(currentEntries)
            CloudDriveScanResult(
                scannedFiles = stats.files,
                scannedFolders = stats.folders,
                createdOrUpdated = stats.changed,
                deleted = deleted,
                skipped = stats.skipped,
            )
        } catch (e: Exception) {
            CloudDriveScanResult(
                scannedFiles = stats.files,
                scannedFolders = stats.folders,
                createdOrUpdated = stats.changed,
                skipped = stats.skipped,
                error = e.message ?: "扫描失败",
            )
        }
    }

    private suspend fun walk(
        dir: DocumentFile,
        parentRelPath: String,
        currentEntries: MutableSet<String>,
        stats: MutableStats,
        existingPathIndex: ExistingPathIndex,
        previousEntries: Set<String>,
        depth: Int,
    ) {
        if (depth > MAX_DEPTH) return
        val cfg = configStore.current
        for (child in dir.listFiles()) {
            val name = child.name
            if (name.isNullOrBlank()) {
                stats.skipped++
                continue
            }
            if (isIgnored(name, child.isDirectory)) {
                stats.skipped++
                continue
            }
            val relPath = CloudDrivePathIdentity.normalize(
                if (parentRelPath.isBlank()) name else "$parentRelPath/$name"
            )
            if (relPath.isBlank()) {
                stats.skipped++
                continue
            }

            when {
                child.isDirectory -> {
                    stats.folders++
                    val folderKey = entryKey(ItemType.CLOUD_FOLDER.value, relPath)
                    val shouldTrack = upsertFolder(relPath, name, existingPathIndex, previousEntries)
                    if (shouldTrack.changed) stats.changed++
                    if (shouldTrack.trackDeletion) {
                        currentEntries.add(folderKey)
                    }
                    walk(child, relPath, currentEntries, stats, existingPathIndex, previousEntries, depth + 1)
                }

                child.isFile -> {
                    val size = child.length().coerceAtLeast(0L)
                    if (cfg.maxFileSize > 0 && size > cfg.maxFileSize) {
                        stats.skipped++
                        continue
                    }
                    stats.files++
                    val fileKey = entryKey(ItemType.CLOUD_FILE.value, relPath)
                    val result = upsertFile(child, relPath, name, size, existingPathIndex, previousEntries)
                    if (result.changed) stats.changed++
                    if (result.trackDeletion) {
                        currentEntries.add(fileKey)
                    }
                }

                else -> stats.skipped++
            }
        }
    }

    private suspend fun upsertFolder(
        relativePath: String,
        name: String,
        existingPathIndex: ExistingPathIndex,
        previousEntries: Set<String>,
    ): ScanUpsertResult {
        val id = CloudDrivePathIdentity.deriveId(relativePath)
        val existing = itemDao.getById(id) ?: existingPathIndex.folders[relativePath]
        val key = entryKey(ItemType.CLOUD_FOLDER.value, relativePath)
        val trackDeletion = existing == null ||
            existing.syncStatus == "modified" ||
            key in previousEntries

        if (existing != null &&
            existing.deletedTime == null &&
            existing.syncStatus == "clean" &&
            key !in previousEntries
        ) {
            return ScanUpsertResult(changed = false, trackDeletion = false)
        }

        val payload = CloudFolderPayload(
            name = name,
            parentFolderId = CloudDrivePathIdentity.deriveParentFolderId(relativePath),
            relativePath = relativePath,
        )
        val payloadJson = json.encodeToString(payload)
        return ScanUpsertResult(
            changed = upsertCloudItem(id, ItemType.CLOUD_FOLDER.value, payloadJson, existing),
            trackDeletion = trackDeletion,
        )
    }

    private suspend fun upsertFile(
        file: DocumentFile,
        relativePath: String,
        name: String,
        size: Long,
        existingPathIndex: ExistingPathIndex,
        previousEntries: Set<String>,
    ): ScanUpsertResult {
        val id = CloudDrivePathIdentity.deriveId(relativePath)
        val existing = itemDao.getById(id) ?: existingPathIndex.files[relativePath]
        val key = entryKey(ItemType.CLOUD_FILE.value, relativePath)
        val mtime = file.lastModified().takeIf { it > 0L } ?: System.currentTimeMillis()
        val existingPayload = existing
            ?.takeIf { it.type == ItemType.CLOUD_FILE.value && it.deletedTime == null }
            ?.let { runCatching { CloudFilePayload.fromJson(json, it.payload) }.getOrNull() }
        val localRecord = localPathDao.getByCloudFileId(id)

        val staleOnlineOnlyPlaceholder = existing != null &&
            existing.deletedTime == null &&
            existing.syncStatus == "clean" &&
            existingPayload != null &&
            localRecord == null &&
            size <= 0L &&
            (existingPayload.fileHash.isNotBlank() || existingPayload.size > 0L)
        if (staleOnlineOnlyPlaceholder) {
            runCatching { file.delete() }
            return ScanUpsertResult(changed = false, trackDeletion = false)
        }

        val downloadedCacheUnchanged = existing != null &&
            existing.deletedTime == null &&
            existing.syncStatus == "clean" &&
            existingPayload != null &&
            localRecord != null &&
            localRecord.documentUri == file.uri.toString() &&
            localRecord.state == CloudDownloadState.COMPLETED.value &&
            (localRecord.downloadedAt == null || mtime <= localRecord.downloadedAt + MTIME_TOLERANCE_MS) &&
            existingPayload.size == size &&
            (existingPayload.fileHash.isBlank() ||
                localRecord.fileHashVerified?.takeIf { it.isNotBlank() }?.equals(
                    existingPayload.fileHash,
                    ignoreCase = true
                ) == true)

        if (downloadedCacheUnchanged) {
            return ScanUpsertResult(changed = false, trackDeletion = false)
        }

        val trackDeletion = existing == null ||
            existing.syncStatus == "modified" ||
            key in previousEntries ||
            localRecord == null

        if (existingPayload != null &&
            existingPayload.size == size &&
            abs(existingPayload.mtime - mtime) < MTIME_TOLERANCE_MS &&
            existingPayload.uploadState in STABLE_UPLOAD_STATES
        ) {
            return ScanUpsertResult(changed = false, trackDeletion = trackDeletion)
        }

        val payload = CloudFilePayload(
            filename = name,
            mimeType = file.type?.takeIf { it.isNotBlank() } ?: guessMimeFromExtension(name),
            size = size,
            fileHash = "",
            parentFolderId = CloudDrivePathIdentity.deriveParentFolderId(relativePath),
            relativePath = relativePath,
            mtime = mtime,
            uploadState = CloudUploadState.PENDING.value,
            chunkSize = configStore.current.chunkSize,
            totalChunks = 0,
            uploadedChunks = emptyList(),
            uploadSessionId = null,
            errorMessage = null,
            downloadState = CloudDownloadState.COMPLETED.value,
            downloadedSize = size,
            downloadedAt = mtime,
            downloadError = null,
        )
        val payloadJson = json.encodeToString(payload)
        return ScanUpsertResult(
            changed = upsertCloudItem(id, ItemType.CLOUD_FILE.value, payloadJson, existing),
            trackDeletion = trackDeletion,
        )
    }

    private suspend fun upsertCloudItem(
        id: String,
        type: String,
        payloadJson: String,
        knownExisting: ItemEntity? = null,
    ): Boolean {
        val existing = knownExisting ?: itemDao.getById(id)
        val hash = computeContentHash(payloadJson)
        if (existing != null &&
            existing.deletedTime == null &&
            existing.type == type &&
            existing.contentHash == hash
        ) {
            return false
        }

        val now = System.currentTimeMillis()
        val item = if (existing == null) {
            ItemEntity(
                id = id,
                type = type,
                createdTime = now,
                updatedTime = now,
                deletedTime = null,
                payload = payloadJson,
                contentHash = hash,
                syncStatus = "modified",
                localRev = 1,
                remoteRev = null,
                encryptionApplied = 0,
                schemaVersion = 1,
            )
        } else {
            existing.copy(
                type = type,
                updatedTime = now,
                deletedTime = null,
                payload = payloadJson,
                contentHash = hash,
                syncStatus = "modified",
                localRev = existing.localRev + 1,
                encryptionApplied = 0,
            )
        }

        itemDao.upsert(item)
        return true
    }

    private suspend fun reconcileDeleted(
        currentEntries: Set<String>,
        previousEntries: Set<String>,
    ): Int {
        if (previousEntries.isEmpty() || !configStore.current.syncDeletions) return 0

        val missing = previousEntries - currentEntries
        if (missing.isEmpty()) return 0

        val activeFiles = itemDao.getByTypeOnce(ItemType.CLOUD_FILE.value)
        val activeFolders = itemDao.getByTypeOnce(ItemType.CLOUD_FOLDER.value)
        val activeFilesByPath = activeFiles.associateBy { entity ->
            runCatching {
                CloudDrivePathIdentity.normalize(
                    CloudFilePayload.fromJson(json, entity.payload).relativePath
                )
            }.getOrDefault("")
        }.filterKeys { it.isNotBlank() }
        val activeFoldersByPath = activeFolders.associateBy { entity ->
            runCatching {
                CloudDrivePathIdentity.normalize(
                    json.decodeFromString<CloudFolderPayload>(entity.payload).relativePath
                )
            }.getOrDefault("")
        }.filterKeys { it.isNotBlank() }
        val localPathRecordsById = localPathDao.getAll().associateBy { it.cloudFileId }
        val idsToDelete = linkedSetOf<String>()

        for (entry in missing) {
            val (type, relPath) = parseEntryKey(entry) ?: continue
            val id = CloudDrivePathIdentity.deriveId(relPath)
            val item = itemDao.getById(id) ?: (
                if (type == ItemType.CLOUD_FILE.value) activeFilesByPath[relPath] else activeFoldersByPath[relPath]
            ) ?: continue
            if (item.deletedTime != null || item.type != type) continue

            if (type == ItemType.CLOUD_FILE.value &&
                item.syncStatus == "clean" &&
                localPathRecordsById.containsKey(item.id)
            ) {
                localPathDao.delete(item.id)
                continue
            }

            if (type == ItemType.CLOUD_FOLDER.value &&
                item.syncStatus == "clean" &&
                folderMissingIsOnlyDownloadedCache(relPath, activeFiles, localPathRecordsById.keys)
            ) {
                val prefix = "$relPath/"
                for (file in activeFiles) {
                    val payload = runCatching {
                        CloudFilePayload.fromJson(json, file.payload)
                    }.getOrNull() ?: continue
                    if (CloudDrivePathIdentity.normalize(payload.relativePath).startsWith(prefix)) {
                        localPathDao.delete(file.id)
                    }
                }
                continue
            }

            idsToDelete.add(item.id)
            if (type == ItemType.CLOUD_FOLDER.value) {
                val prefix = "$relPath/"
                for (folder in activeFolders) {
                    val payload = runCatching {
                        json.decodeFromString<CloudFolderPayload>(folder.payload)
                    }.getOrNull() ?: continue
                    if (CloudDrivePathIdentity.normalize(payload.relativePath).startsWith(prefix)) {
                        idsToDelete.add(folder.id)
                    }
                }
                for (file in activeFiles) {
                    val payload = runCatching {
                        CloudFilePayload.fromJson(json, file.payload)
                    }.getOrNull() ?: continue
                    if (CloudDrivePathIdentity.normalize(payload.relativePath).startsWith(prefix)) {
                        idsToDelete.add(file.id)
                    }
                }
            }
        }

        val now = System.currentTimeMillis()
        for (id in idsToDelete) {
            localPathDao.delete(id)
            itemDao.softDelete(id, now)
        }
        return idsToDelete.size
    }

    private fun folderMissingIsOnlyDownloadedCache(
        folderRelPath: String,
        activeFiles: List<ItemEntity>,
        localPathIds: Set<String>,
    ): Boolean {
        val prefix = "$folderRelPath/"
        var hasDescendantFile = false
        for (file in activeFiles) {
            if (file.deletedTime != null || file.type != ItemType.CLOUD_FILE.value) continue
            val payload = runCatching {
                CloudFilePayload.fromJson(json, file.payload)
            }.getOrNull() ?: continue
            if (!CloudDrivePathIdentity.normalize(payload.relativePath).startsWith(prefix)) continue
            hasDescendantFile = true
            if (file.id !in localPathIds) return false
        }
        return hasDescendantFile
    }

    private suspend fun buildExistingPathIndex(): ExistingPathIndex {
        val files = itemDao.getByTypeOnce(ItemType.CLOUD_FILE.value).mapNotNull { entity ->
            val relPath = runCatching {
                CloudDrivePathIdentity.normalize(
                    CloudFilePayload.fromJson(json, entity.payload).relativePath
                )
            }.getOrNull().orEmpty()
            relPath.takeIf { it.isNotBlank() }?.let { it to entity }
        }.toMap()
        val folders = itemDao.getByTypeOnce(ItemType.CLOUD_FOLDER.value).mapNotNull { entity ->
            val relPath = runCatching {
                CloudDrivePathIdentity.normalize(
                    json.decodeFromString<CloudFolderPayload>(entity.payload).relativePath
                )
            }.getOrNull().orEmpty()
            relPath.takeIf { it.isNotBlank() }?.let { it to entity }
        }.toMap()
        return ExistingPathIndex(files = files, folders = folders)
    }

    private fun isIgnored(name: String, isDirectory: Boolean): Boolean {
        val cfg = configStore.current
        if (cfg.ignoreHidden && name.startsWith(".")) return true
        if (isDirectory && name == "node_modules") return true
        return cfg.ignorePatterns.any { matchGlob(name, it) }
    }

    private fun matchGlob(name: String, pattern: String): Boolean {
        if (pattern.isBlank()) return false
        val regex = pattern.map { ch ->
            if (ch == '*') ".*" else Regex.escape(ch.toString())
        }.joinToString("")
        return Regex("^$regex$", RegexOption.IGNORE_CASE).matches(name)
    }

    private fun entryKey(type: String, relativePath: String): String =
        "$type:${CloudDrivePathIdentity.normalize(relativePath)}"

    private fun parseEntryKey(key: String): Pair<String, String>? {
        val colon = key.indexOf(':')
        if (colon <= 0 || colon >= key.lastIndex) return null
        val type = key.substring(0, colon)
        val relPath = CloudDrivePathIdentity.normalize(key.substring(colon + 1))
        if (relPath.isBlank()) return null
        return type to relPath
    }

    private fun loadSnapshot(): Set<String> =
        prefs.getStringSet(KEY_ENTRIES, emptySet())?.toSet().orEmpty()

    private fun saveSnapshot(entries: Set<String>) {
        prefs.edit().putStringSet(KEY_ENTRIES, entries.toSet()).apply()
    }

    private fun computeContentHash(content: String): String {
        val digest = MessageDigest.getInstance("SHA-256")
        return digest.digest(content.toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it.toInt() and 0xff) }
            .take(16)
    }

    private fun guessMimeFromExtension(filename: String): String {
        val lower = filename.lowercase()
        return when {
            lower.endsWith(".jpg") || lower.endsWith(".jpeg") -> "image/jpeg"
            lower.endsWith(".png") -> "image/png"
            lower.endsWith(".gif") -> "image/gif"
            lower.endsWith(".webp") -> "image/webp"
            lower.endsWith(".pdf") -> "application/pdf"
            lower.endsWith(".txt") -> "text/plain"
            lower.endsWith(".zip") -> "application/zip"
            lower.endsWith(".apk") -> "application/vnd.android.package-archive"
            else -> "application/octet-stream"
        }
    }

    private data class MutableStats(
        var files: Int = 0,
        var folders: Int = 0,
        var changed: Int = 0,
        var skipped: Int = 0,
    )

    private data class ExistingPathIndex(
        val files: Map<String, ItemEntity>,
        val folders: Map<String, ItemEntity>,
    )

    private data class ScanUpsertResult(
        val changed: Boolean,
        val trackDeletion: Boolean,
    )

    companion object {
        private const val PREFS_NAME = "cloud_drive_scan_snapshot"
        private const val KEY_ENTRIES = "entries"
        private const val MAX_DEPTH = 64
        private const val MTIME_TOLERANCE_MS = 1000L
        private val STABLE_UPLOAD_STATES = setOf(
            CloudUploadState.COMPLETED.value,
            CloudUploadState.PENDING.value,
            CloudUploadState.UPLOADING.value,
        )
    }
}
