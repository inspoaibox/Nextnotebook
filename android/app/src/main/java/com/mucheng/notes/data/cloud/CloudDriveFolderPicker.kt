package com.mucheng.notes.data.cloud

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.util.Log
import androidx.documentfile.provider.DocumentFile
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * 网盘 SAF 目录授权与持久化权限管理（Android 端）。
 *
 * Android 的目录选择必须通过 [androidx.activity.result.contract.ActivityResultContracts.OpenDocumentTree]
 * 在 Composable / Activity 作用域发起，本类不直接持有 Launcher，而是封装：
 *
 * 1. [takePersistablePermission]：在用户选中目录、Launcher 回调到 tree-uri
 *    后调用，请求 "可持久化" 的读写权限，使 App 重启后仍能访问该目录。
 * 2. [releasePermission]：用户撤销授权时调用，释放持久化权限。
 * 3. [resolveRootDocumentFile]：从持久化的 tree-uri 重建 [DocumentFile] 根，
 *    供 CloudDriveDownloadManager / UploadManager 写入文件。
 * 4. [buildRelativeDocumentFile]：根据 payload.relativePath 在根目录下逐层
 *    mkdirs 创建子目录并定位目标文件。
 *
 * 注意：tree-uri 的字符串本身由 [CloudDriveConfigStore] 持久化，
 * 本类只负责权限与 DocumentFile 的解析，保持职责单一。
 */
@Singleton
class CloudDriveFolderPicker @Inject constructor(
    @ApplicationContext private val context: Context,
    private val configStore: CloudDriveConfigStore
) {
    /**
     * 为给定的 tree-uri 请求可持久化的读写权限。
     *
     * 必须在 ActivityResultContracts.OpenDocumentTree 回调中、且仍在前台时调用，
     * 否则 [ContentResolver.takePersistableUriPermission] 会失败。
     *
     * 成功后会把 tree-uri 写入 [CloudDriveConfigStore]，并返回 true；
     * 失败（例如权限已被系统回收、或调用时机不对）返回 false。
     */
    fun takePersistablePermission(treeUri: Uri): Boolean {
        return try {
            val flags = Intent.FLAG_GRANT_READ_URI_PERMISSION or
                Intent.FLAG_GRANT_WRITE_URI_PERMISSION
            context.contentResolver.takePersistableUriPermission(treeUri, flags)
            configStore.setWatchedTreeUri(treeUri.toString())
            Log.i(TAG, "SAF permission persisted for $treeUri")
            true
        } catch (e: SecurityException) {
            Log.e(TAG, "takePersistableUriPermission failed: ${e.message}")
            false
        } catch (e: Exception) {
            Log.e(TAG, "Unexpected error persisting SAF permission: ${e.message}")
            false
        }
    }

    /**
     * 释放当前持久化的 tree-uri 权限并清空配置。
     * 用于 UI 中的"撤销授权"操作。
     */
    fun releasePermission() {
        val treeUriStr = configStore.current.watchedRootPath ?: return
        runCatching {
            val uri = Uri.parse(treeUriStr)
            val flags = Intent.FLAG_GRANT_READ_URI_PERMISSION or
                Intent.FLAG_GRANT_WRITE_URI_PERMISSION
            context.contentResolver.releasePersistableUriPermission(uri, flags)
        }.onFailure { e ->
            // releasePersistableUriPermission 在权限不存在时会抛出，可忽略
            Log.w(TAG, "releasePersistableUriPermission: ${e.message}")
        }
        configStore.clearAuthorization()
    }

    /**
     * 从 [CloudDriveConfigStore] 当前持久化的 tree-uri 重建根 [DocumentFile]。
     *
     * @return 根目录的 DocumentFile；未授权、权限已被系统回收、或目录已被用户
     *   删除时返回 null（调用方据此提示用户重新授权）。
     */
    fun resolveRootDocumentFile(): DocumentFile? {
        val treeUriStr = configStore.current.watchedRootPath ?: return null
        return runCatching {
            val uri = Uri.parse(treeUriStr)
            val root = DocumentFile.fromTreeUri(context, uri) ?: return null
            // canWrite 同时校验目录仍然存在 + 写权限尚未被回收
            if (!root.canWrite()) null else root
        }.getOrElse { e ->
            Log.w(TAG, "resolveRootDocumentFile failed: ${e.message}")
            null
        }
    }

    /**
     * 在根目录下按相对路径创建/定位文件。
     *
     * relativePath 形如 "docs/work/report.pdf"，会逐级创建中间目录，
     * 最后创建（或找到）同名文件。
     *
     * @param relativePath 相对根目录的 POSIX 风格路径，可包含子目录
     * @return 目标文件的 DocumentFile；中途任一目录创建失败返回 null
     */
    fun buildRelativeDocumentFile(relativePath: String): DocumentFile? {
        val root = resolveRootDocumentFile() ?: return null
        return buildRelative(root, relativePath)
    }

    private fun buildRelative(root: DocumentFile, relativePath: String): DocumentFile? {
        if (relativePath.isBlank() || relativePath == "/") {
            // 不应出现空相对路径写入文件；返回根目录让上层报错
            return null
        }
        val normalized = relativePath.trimStart('/').trimEnd('/')
        val parts = normalized.split('/').filter { it.isNotBlank() }
        if (parts.isEmpty()) return null

        var current = root
        // 除最后一段（文件名）外，逐级创建子目录
        for (i in 0 until parts.size - 1) {
            val name = parts[i]
            current = current.findFile(name)?.let { existing ->
                if (existing.isDirectory) existing else {
                    // 同名文件占位、非目录，无法继续
                    Log.w(TAG, "buildRelative: $name is not a directory, abort")
                    return null
                }
            } ?: current.createDirectory(name) ?: run {
                Log.w(TAG, "buildRelative: failed to create dir $name")
                return null
            }
        }

        val fileName = parts.last()
        // 若已存在同名文件，直接复用（断点续传/覆盖写）
        return current.findFile(fileName) ?: current.createFile("application/octet-stream", fileName)
    }

    companion object {
        private const val TAG = "CloudDriveFolderPicker"
    }
}
