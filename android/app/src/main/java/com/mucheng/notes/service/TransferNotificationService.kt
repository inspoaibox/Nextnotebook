/**
 * LAN Transfer Assistant - 通知服务
 */

package com.mucheng.notes.service

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.mucheng.notes.R
import com.mucheng.notes.presentation.MainActivity

/**
 * 传输通知服务
 */
object TransferNotificationService {
    
    private const val CHANNEL_ID = "transfer_channel"
    private const val CHANNEL_NAME = "传输助手"
    private const val CHANNEL_DESCRIPTION = "传输助手消息通知"
    
    private const val NOTIFICATION_ID_MESSAGE = 1001
    private const val NOTIFICATION_ID_FILE = 1002
    private const val NOTIFICATION_ID_TRANSFER_PROGRESS = 1003
    
    /**
     * 创建通知渠道
     */
    fun createNotificationChannel(context: Context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val importance = NotificationManager.IMPORTANCE_DEFAULT
            val channel = NotificationChannel(CHANNEL_ID, CHANNEL_NAME, importance).apply {
                description = CHANNEL_DESCRIPTION
                enableVibration(true)
                setShowBadge(true)
            }
            
            val notificationManager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.createNotificationChannel(channel)
        }
    }
    
    /**
     * 显示新消息通知
     */
    fun showMessageNotification(
        context: Context,
        senderName: String,
        messageContent: String,
        sessionId: String
    ) {
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("navigate_to", "transfer")
            putExtra("session_id", sessionId)
        }
        
        val pendingIntent = PendingIntent.getActivity(
            context,
            0,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        
        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setContentTitle(senderName)
            .setContentText(messageContent)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .build()
        
        try {
            NotificationManagerCompat.from(context).notify(NOTIFICATION_ID_MESSAGE, notification)
        } catch (e: SecurityException) {
            // 没有通知权限
            android.util.Log.w("TransferNotification", "No notification permission")
        }
    }
    
    /**
     * 显示文件接收通知
     */
    fun showFileReceivedNotification(
        context: Context,
        senderName: String,
        filename: String,
        sessionId: String
    ) {
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("navigate_to", "transfer")
            putExtra("session_id", sessionId)
        }
        
        val pendingIntent = PendingIntent.getActivity(
            context,
            0,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        
        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setContentTitle("收到文件")
            .setContentText("$senderName 发送了文件: $filename")
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .build()
        
        try {
            NotificationManagerCompat.from(context).notify(NOTIFICATION_ID_FILE, notification)
        } catch (e: SecurityException) {
            android.util.Log.w("TransferNotification", "No notification permission")
        }
    }
    
    /**
     * 显示文件传输进度通知
     */
    fun showTransferProgressNotification(
        context: Context,
        filename: String,
        progress: Int,
        isUpload: Boolean
    ) {
        val title = if (isUpload) "正在发送文件" else "正在接收文件"
        
        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setContentTitle(title)
            .setContentText(filename)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setProgress(100, progress, false)
            .setOngoing(true)
            .setCategory(NotificationCompat.CATEGORY_PROGRESS)
            .build()
        
        try {
            NotificationManagerCompat.from(context).notify(NOTIFICATION_ID_TRANSFER_PROGRESS, notification)
        } catch (e: SecurityException) {
            android.util.Log.w("TransferNotification", "No notification permission")
        }
    }
    
    /**
     * 取消传输进度通知
     */
    fun cancelTransferProgressNotification(context: Context) {
        NotificationManagerCompat.from(context).cancel(NOTIFICATION_ID_TRANSFER_PROGRESS)
    }
    
    /**
     * 取消所有通知
     */
    fun cancelAllNotifications(context: Context) {
        NotificationManagerCompat.from(context).cancelAll()
    }
}
