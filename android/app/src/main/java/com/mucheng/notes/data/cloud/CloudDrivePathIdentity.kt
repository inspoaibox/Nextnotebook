package com.mucheng.notes.data.cloud

import java.security.MessageDigest

/**
 * Cloud drive path identity helpers shared by Android cloud-drive code.
 *
 * Keep this in sync with desktop CloudDriveService. The item id is derived from
 * relative_path so the same file/folder does not become different records on
 * desktop, Android, and the sync server.
 */
object CloudDrivePathIdentity {
    private const val CLOUD_DRIVE_NAMESPACE = "6f3c1d2a-9b7e-4a8c-b5f3-2e1d0c9b8a74"

    fun normalize(path: String): String =
        path.replace('\\', '/')
            .trim()
            .trim('/')
            .split('/')
            .filter { it.isNotBlank() }
            .joinToString("/")

    fun parentPath(path: String): String {
        val normalized = normalize(path)
        if (normalized.isBlank()) return ""
        val slash = normalized.lastIndexOf('/')
        return if (slash < 0) "" else normalized.substring(0, slash)
    }

    fun baseName(path: String): String =
        normalize(path).substringAfterLast('/')

    fun deriveId(relativePath: String): String {
        val normalized = normalize(relativePath)
        val digest = MessageDigest.getInstance("SHA-1")
            .digest("$CLOUD_DRIVE_NAMESPACE:$normalized".toByteArray(Charsets.UTF_8))
            .take(16)
            .joinToString("") { "%02x".format(it.toInt() and 0xff) }
        return digest.replace(
            Regex("^(.{8})(.{4})(.{4})(.{4})(.{12})$"),
            "$1-$2-$3-$4-$5"
        )
    }

    fun deriveParentFolderId(relativePath: String): String {
        val parent = parentPath(relativePath)
        return if (parent.isBlank()) "root" else deriveId(parent)
    }
}
