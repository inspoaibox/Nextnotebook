package com.mucheng.notes.presentation.screens.lock

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Backspace
import androidx.compose.material.icons.filled.Fingerprint
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.fragment.app.FragmentActivity
import androidx.hilt.navigation.compose.hiltViewModel
import com.mucheng.notes.R
import com.mucheng.notes.presentation.viewmodel.LockScreenViewModel
import com.mucheng.notes.security.LockType

/**
 * 锁屏界面
 * 
 * 支持 PIN 码和生物识别解锁
 */
@Composable
fun LockScreen(
    onUnlocked: () -> Unit,
    viewModel: LockScreenViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    val context = LocalContext.current
    
    // 设置 Activity 用于生物识别
    LaunchedEffect(Unit) {
        (context as? FragmentActivity)?.let { activity ->
            viewModel.setActivity(activity)
        }
    }
    
    LaunchedEffect(uiState.isUnlocked) {
        if (uiState.isUnlocked) {
            onUnlocked()
        }
    }
    
    Surface(
        modifier = Modifier.fillMaxSize(),
        color = MaterialTheme.colorScheme.background
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            // 应用图标和标题
            Text(
                text = stringResource(R.string.app_name),
                style = MaterialTheme.typography.headlineMedium,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.primary
            )
            
            Spacer(modifier = Modifier.height(8.dp))
            
            Text(
                text = stringResource(R.string.lock_screen_title),
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            
            Spacer(modifier = Modifier.height(48.dp))
            
            when (uiState.lockType) {
                LockType.PIN -> {
                    PinInput(
                        pin = uiState.enteredPin,
                        pinLength = uiState.pinLength,
                        error = uiState.error,
                        onPinChange = { viewModel.onPinChange(it) },
                        onBiometricClick = if (uiState.biometricAvailable) {
                            { viewModel.authenticateWithBiometric() }
                        } else null
                    )
                }
                LockType.BIOMETRIC -> {
                    BiometricPrompt(
                        error = uiState.error,
                        onRetry = { viewModel.authenticateWithBiometric() },
                        onUsePinClick = { viewModel.switchToPinMode() }
                    )
                }
                LockType.PATTERN -> {
                    // TODO: 实现图案解锁
                    PatternInput(
                        error = uiState.error,
                        onPatternComplete = { viewModel.onPatternComplete(it) }
                    )
                }
                LockType.NONE -> {
                    // 不应该到达这里
                    onUnlocked()
                }
            }
        }
    }
}

/**
 * PIN 码输入组件
 */
@Composable
private fun PinInput(
    pin: String,
    pinLength: Int,
    error: String?,
    onPinChange: (String) -> Unit,
    onBiometricClick: (() -> Unit)?
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        // PIN 码显示 - 根据实际 PIN 长度显示圆点
        Row(
            horizontalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            repeat(pinLength) { index ->
                PinDot(filled = index < pin.length)
            }
        }
        
        Spacer(modifier = Modifier.height(16.dp))
        
        // 错误提示
        AnimatedVisibility(
            visible = error != null,
            enter = fadeIn(),
            exit = fadeOut()
        ) {
            Text(
                text = error ?: "",
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodyMedium
            )
        }
        
        Spacer(modifier = Modifier.height(32.dp))
        
        // 数字键盘
        NumberPad(
            onNumberClick = { number ->
                if (pin.length < pinLength) {
                    onPinChange(pin + number)
                }
            },
            onDeleteClick = {
                if (pin.isNotEmpty()) {
                    onPinChange(pin.dropLast(1))
                }
            },
            onBiometricClick = onBiometricClick
        )
    }
}

/**
 * PIN 码圆点
 */
@Composable
private fun PinDot(filled: Boolean) {
    Box(
        modifier = Modifier
            .size(16.dp)
            .clip(CircleShape)
            .background(
                if (filled) MaterialTheme.colorScheme.primary
                else Color.Transparent
            )
            .border(
                width = 2.dp,
                color = MaterialTheme.colorScheme.primary,
                shape = CircleShape
            )
    )
}

/**
 * 数字键盘
 */
@Composable
private fun NumberPad(
    onNumberClick: (String) -> Unit,
    onDeleteClick: () -> Unit,
    onBiometricClick: (() -> Unit)?
) {
    Column(
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // 1-9
        for (row in 0..2) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(24.dp)
            ) {
                for (col in 1..3) {
                    val number = row * 3 + col
                    NumberButton(
                        number = number.toString(),
                        onClick = { onNumberClick(number.toString()) }
                    )
                }
            }
        }
        
        // 底部行：生物识别/空、0、删除
        Row(
            horizontalArrangement = Arrangement.spacedBy(24.dp)
        ) {
            // 生物识别按钮
            if (onBiometricClick != null) {
                IconButton(
                    onClick = onBiometricClick,
                    modifier = Modifier.size(72.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.Fingerprint,
                        contentDescription = stringResource(R.string.biometric_prompt_title),
                        modifier = Modifier.size(32.dp),
                        tint = MaterialTheme.colorScheme.primary
                    )
                }
            } else {
                Spacer(modifier = Modifier.size(72.dp))
            }
            
            // 0
            NumberButton(
                number = "0",
                onClick = { onNumberClick("0") }
            )
            
            // 删除按钮
            IconButton(
                onClick = onDeleteClick,
                modifier = Modifier.size(72.dp)
            ) {
                Icon(
                    imageVector = Icons.Default.Backspace,
                    contentDescription = stringResource(R.string.delete),
                    modifier = Modifier.size(28.dp),
                    tint = MaterialTheme.colorScheme.onSurface
                )
            }
        }
    }
}

/**
 * 数字按钮
 */
@Composable
private fun NumberButton(
    number: String,
    onClick: () -> Unit
) {
    Box(
        modifier = Modifier
            .size(72.dp)
            .clip(CircleShape)
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        Text(
            text = number,
            fontSize = 28.sp,
            fontWeight = FontWeight.Medium,
            color = MaterialTheme.colorScheme.onSurface
        )
    }
}

/**
 * 生物识别提示
 */
@Composable
private fun BiometricPrompt(
    error: String?,
    onRetry: () -> Unit,
    onUsePinClick: () -> Unit
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Icon(
            imageVector = Icons.Default.Fingerprint,
            contentDescription = null,
            modifier = Modifier.size(80.dp),
            tint = MaterialTheme.colorScheme.primary
        )
        
        Spacer(modifier = Modifier.height(24.dp))
        
        Text(
            text = stringResource(R.string.biometric_prompt_subtitle),
            style = MaterialTheme.typography.bodyLarge,
            textAlign = TextAlign.Center
        )
        
        if (error != null) {
            Spacer(modifier = Modifier.height(16.dp))
            
            Text(
                text = error,
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodyMedium
            )
            
            Spacer(modifier = Modifier.height(16.dp))
            
            Button(onClick = onRetry) {
                Text(stringResource(R.string.retry))
            }
        }
        
        Spacer(modifier = Modifier.height(32.dp))
        
        TextButton(onClick = onUsePinClick) {
            Text(stringResource(R.string.biometric_prompt_negative))
        }
    }
}

/**
 * 图案输入（简化版）
 */
@Composable
private fun PatternInput(
    error: String?,
    onPatternComplete: (List<Int>) -> Unit
) {
    var pattern by remember { mutableStateOf(listOf<Int>()) }
    
    Column(
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = stringResource(R.string.draw_pattern),
            style = MaterialTheme.typography.bodyLarge
        )
        
        Spacer(modifier = Modifier.height(32.dp))
        
        // 3x3 图案网格
        Column(
            verticalArrangement = Arrangement.spacedBy(24.dp)
        ) {
            for (row in 0..2) {
                Row(
                    horizontalArrangement = Arrangement.spacedBy(24.dp)
                ) {
                    for (col in 0..2) {
                        val index = row * 3 + col
                        PatternDot(
                            selected = pattern.contains(index),
                            onClick = {
                                if (!pattern.contains(index)) {
                                    val newPattern = pattern + index
                                    pattern = newPattern
                                    if (newPattern.size >= 4) {
                                        onPatternComplete(newPattern)
                                        pattern = emptyList()
                                    }
                                }
                            }
                        )
                    }
                }
            }
        }
        
        if (error != null) {
            Spacer(modifier = Modifier.height(16.dp))
            
            Text(
                text = error,
                color = MaterialTheme.colorScheme.error,
                style = MaterialTheme.typography.bodyMedium
            )
        }
        
        Spacer(modifier = Modifier.height(16.dp))
        
        TextButton(onClick = { pattern = emptyList() }) {
            Text(stringResource(R.string.clear))
        }
    }
}

/**
 * 图案圆点
 */
@Composable
private fun PatternDot(
    selected: Boolean,
    onClick: () -> Unit
) {
    Box(
        modifier = Modifier
            .size(64.dp)
            .clip(CircleShape)
            .background(
                if (selected) MaterialTheme.colorScheme.primary.copy(alpha = 0.2f)
                else MaterialTheme.colorScheme.surfaceVariant
            )
            .clickable(onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        Box(
            modifier = Modifier
                .size(if (selected) 24.dp else 16.dp)
                .clip(CircleShape)
                .background(
                    if (selected) MaterialTheme.colorScheme.primary
                    else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f)
                )
        )
    }
}
