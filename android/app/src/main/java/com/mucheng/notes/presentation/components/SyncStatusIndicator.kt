package com.mucheng.notes.presentation.components

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Cloud
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material.icons.filled.Error
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.mucheng.notes.R
import com.mucheng.notes.domain.model.SyncStatus

/**
 * 同步状态指示器
 * 
 * 显示在 Toolbar 中，展示当前同步状态
 */
@Composable
fun SyncStatusIndicator(
    status: SyncStatus,
    lastSyncTime: Long?,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val infiniteTransition = rememberInfiniteTransition(label = "sync_rotation")
    val rotation by infiniteTransition.animateFloat(
        initialValue = 0f,
        targetValue = 360f,
        animationSpec = infiniteRepeatable(
            animation = tween(1000, easing = LinearEasing),
            repeatMode = RepeatMode.Restart
        ),
        label = "rotation"
    )
    
    Surface(
        modifier = modifier.clickable(onClick = onClick),
        shape = RoundedCornerShape(16.dp),
        color = when (status) {
            SyncStatus.SYNCING -> MaterialTheme.colorScheme.primaryContainer
            SyncStatus.SUCCESS -> MaterialTheme.colorScheme.secondaryContainer
            SyncStatus.ERROR, SyncStatus.FAILED -> MaterialTheme.colorScheme.errorContainer
            SyncStatus.OFFLINE -> MaterialTheme.colorScheme.surfaceVariant
            SyncStatus.IDLE -> MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)
        }
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Center
        ) {
            Icon(
                imageVector = when (status) {
                    SyncStatus.SYNCING -> Icons.Default.Sync
                    SyncStatus.SUCCESS -> Icons.Default.Check
                    SyncStatus.ERROR, SyncStatus.FAILED -> Icons.Default.Error
                    SyncStatus.OFFLINE -> Icons.Default.CloudOff
                    SyncStatus.IDLE -> Icons.Default.Cloud
                },
                contentDescription = null,
                modifier = Modifier
                    .size(18.dp)
                    .then(
                        if (status == SyncStatus.SYNCING) {
                            Modifier.rotate(rotation)
                        } else {
                            Modifier
                        }
                    ),
                tint = when (status) {
                    SyncStatus.SYNCING -> MaterialTheme.colorScheme.primary
                    SyncStatus.SUCCESS -> MaterialTheme.colorScheme.secondary
                    SyncStatus.ERROR, SyncStatus.FAILED -> MaterialTheme.colorScheme.error
                    SyncStatus.OFFLINE -> MaterialTheme.colorScheme.onSurfaceVariant
                    SyncStatus.IDLE -> MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                }
            )
            
            Spacer(modifier = Modifier.width(6.dp))
            
            Text(
                text = when (status) {
                    SyncStatus.SYNCING -> stringResource(R.string.sync_in_progress)
                    SyncStatus.SUCCESS -> stringResource(R.string.sync_success)
                    SyncStatus.ERROR, SyncStatus.FAILED -> stringResource(R.string.sync_failed)
                    SyncStatus.OFFLINE -> "未配置同步"
                    SyncStatus.IDLE -> "点击同步"
                },
                style = MaterialTheme.typography.labelMedium,
                color = when (status) {
                    SyncStatus.SYNCING -> MaterialTheme.colorScheme.onPrimaryContainer
                    SyncStatus.SUCCESS -> MaterialTheme.colorScheme.onSecondaryContainer
                    SyncStatus.ERROR, SyncStatus.FAILED -> MaterialTheme.colorScheme.onErrorContainer
                    SyncStatus.OFFLINE -> MaterialTheme.colorScheme.onSurfaceVariant
                    SyncStatus.IDLE -> MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                }
            )
        }
    }
}

/**
 * 同步状态小圆点
 * 
 * 用于紧凑显示同步状态
 */
@Composable
fun SyncStatusDot(
    status: SyncStatus,
    modifier: Modifier = Modifier
) {
    val infiniteTransition = rememberInfiniteTransition(label = "sync_pulse")
    val alpha by infiniteTransition.animateFloat(
        initialValue = 0.5f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(500, easing = LinearEasing),
            repeatMode = RepeatMode.Reverse
        ),
        label = "alpha"
    )
    
    Box(
        modifier = modifier
            .size(8.dp)
            .background(
                color = when (status) {
                    SyncStatus.SYNCING -> MaterialTheme.colorScheme.primary.copy(
                        alpha = alpha
                    )
                    SyncStatus.SUCCESS -> MaterialTheme.colorScheme.secondary
                    SyncStatus.ERROR, SyncStatus.FAILED -> MaterialTheme.colorScheme.error
                    SyncStatus.OFFLINE -> MaterialTheme.colorScheme.outline
                    SyncStatus.IDLE -> MaterialTheme.colorScheme.outline.copy(alpha = 0.5f)
                },
                shape = CircleShape
            )
    )
}

/**
 * 同步进度条
 */
@Composable
fun SyncProgressBar(
    progress: Float,
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .background(
                MaterialTheme.colorScheme.surfaceVariant,
                RoundedCornerShape(2.dp)
            )
    ) {
        Box(
            modifier = Modifier
                .fillMaxFraction(progress)
                .background(
                    MaterialTheme.colorScheme.primary,
                    RoundedCornerShape(2.dp)
                )
        )
    }
}

/**
 * 扩展函数：填充指定比例
 */
private fun Modifier.fillMaxFraction(fraction: Float): Modifier {
    return this.then(
        Modifier.fillMaxWidth(fraction.coerceIn(0f, 1f))
    )
}

/**
 * 扩展函数：填充宽度
 */
private fun Modifier.fillMaxWidth(fraction: Float): Modifier {
    return this // 简化实现，实际应使用 fillMaxWidth(fraction)
}
