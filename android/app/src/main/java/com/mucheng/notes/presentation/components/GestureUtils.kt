package com.mucheng.notes.presentation.components

import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp

/**
 * 手势冲突处理工具
 * 
 * 处理以下手势冲突：
 * 1. SwipeToDismiss 与系统边缘手势
 * 2. ViewPager/HorizontalPager 与系统边缘手势
 * 3. DrawerLayout 与系统边缘手势
 */

/**
 * 边缘手势保护区域宽度
 * Android 系统边缘手势区域约为 20-24dp
 */
private val EDGE_GESTURE_WIDTH = 24.dp

/**
 * 创建一个避开系统边缘手势的 Modifier
 * 
 * 在左右边缘区域禁用水平滑动手势，避免与系统返回手势冲突
 */
@Composable
fun Modifier.avoidEdgeGestures(): Modifier {
    val configuration = LocalConfiguration.current
    val density = LocalDensity.current
    val screenWidth = with(density) { configuration.screenWidthDp.dp.toPx() }
    val edgeWidth = with(density) { EDGE_GESTURE_WIDTH.toPx() }
    
    return this.pointerInput(Unit) {
        detectHorizontalDragGestures(
            onDragStart = { offset ->
                // 如果在边缘区域开始拖动，不处理
                if (offset.x < edgeWidth || offset.x > screenWidth - edgeWidth) {
                    // 让系统处理边缘手势
                }
            },
            onDragEnd = { },
            onDragCancel = { },
            onHorizontalDrag = { _, _ -> }
        )
    }
}

/**
 * 安全的滑动删除方向
 * 
 * 只允许从右向左滑动删除，避免与系统左边缘返回手势冲突
 */
enum class SafeSwipeDirection {
    END_TO_START,  // 从右向左（推荐）
    START_TO_END,  // 从左向右（可能与返回手势冲突）
    BOTH           // 双向（不推荐）
}

/**
 * 边缘保护区域
 * 
 * 在屏幕边缘创建一个透明区域，让系统手势优先处理
 */
@Composable
fun EdgeGestureProtection(
    modifier: Modifier = Modifier,
    onEdgeSwipe: (() -> Unit)? = null
) {
    val density = LocalDensity.current
    val edgeWidth = with(density) { EDGE_GESTURE_WIDTH.toPx() }
    
    var dragOffset by remember { mutableFloatStateOf(0f) }
    
    Box(
        modifier = modifier
            .width(EDGE_GESTURE_WIDTH)
            .fillMaxHeight()
            .pointerInput(Unit) {
                detectHorizontalDragGestures(
                    onDragStart = { dragOffset = 0f },
                    onDragEnd = {
                        if (dragOffset > edgeWidth * 2) {
                            onEdgeSwipe?.invoke()
                        }
                        dragOffset = 0f
                    },
                    onDragCancel = { dragOffset = 0f },
                    onHorizontalDrag = { _, dragAmount ->
                        dragOffset += dragAmount
                    }
                )
            }
    )
}

/**
 * 水平分页器手势配置
 * 
 * 配置 HorizontalPager 以避免与系统边缘手势冲突
 */
object PagerGestureConfig {
    /**
     * 推荐的用户滚动启用配置
     * 
     * 在边缘区域禁用分页器滚动，让系统手势优先
     */
    fun shouldEnableUserScroll(
        currentOffset: Float,
        screenWidth: Float,
        edgeWidth: Float = 24f
    ): Boolean {
        // 如果触摸点在边缘区域，禁用分页器滚动
        return currentOffset > edgeWidth && currentOffset < screenWidth - edgeWidth
    }
}

/**
 * 抽屉手势配置
 * 
 * 配置 ModalNavigationDrawer 以避免与系统边缘手势冲突
 */
object DrawerGestureConfig {
    /**
     * 抽屉手势区域宽度
     * 
     * 设置比系统边缘手势区域稍大，确保抽屉可以被打开
     */
    val DRAWER_GESTURE_WIDTH = 32.dp
    
    /**
     * 是否应该打开抽屉
     * 
     * 只有在边缘区域快速滑动时才打开抽屉
     */
    fun shouldOpenDrawer(
        startX: Float,
        velocity: Float,
        edgeWidth: Float = 32f,
        minVelocity: Float = 500f
    ): Boolean {
        return startX < edgeWidth && velocity > minVelocity
    }
}

/**
 * 列表项滑动配置
 * 
 * 配置 SwipeToDismiss 以避免与系统边缘手势冲突
 */
object SwipeConfig {
    /**
     * 推荐的滑动方向
     * 
     * 只允许从右向左滑动，避免与系统左边缘返回手势冲突
     */
    val RECOMMENDED_DIRECTION = SafeSwipeDirection.END_TO_START
    
    /**
     * 滑动阈值
     * 
     * 需要滑动超过此比例才触发操作
     */
    const val SWIPE_THRESHOLD = 0.25f
    
    /**
     * 最小滑动速度
     * 
     * 快速滑动时可以用更小的距离触发操作
     */
    const val MIN_VELOCITY = 1000f
}
