/**
 * LAN Transfer Assistant - QR Code Scanner Component
 * 
 * 使用 ZXing 库实现二维码扫描
 */

package com.mucheng.notes.presentation.components

import android.Manifest
import android.content.pm.PackageManager
import android.util.Log
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.FlashOff
import androidx.compose.material.icons.filled.FlashOn
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.core.content.ContextCompat
import com.journeyapps.barcodescanner.BarcodeCallback
import com.journeyapps.barcodescanner.BarcodeResult
import com.journeyapps.barcodescanner.DecoratedBarcodeView

private const val TAG = "QRScanner"

/**
 * 二维码扫描对话框
 */
@Composable
fun QRScannerDialog(
    onDismiss: () -> Unit,
    onScanned: (String) -> Unit
) {
    val context = LocalContext.current
    var hasPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
        )
    }
    var flashEnabled by remember { mutableStateOf(false) }
    var scannerView by remember { mutableStateOf<DecoratedBarcodeView?>(null) }
    
    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        hasPermission = isGranted
    }
    
    LaunchedEffect(Unit) {
        if (!hasPermission) {
            permissionLauncher.launch(Manifest.permission.CAMERA)
        }
    }
    
    Dialog(
        onDismissRequest = onDismiss,
        properties = DialogProperties(
            dismissOnBackPress = true,
            dismissOnClickOutside = false,
            usePlatformDefaultWidth = false
        )
    ) {
        Surface(
            modifier = Modifier
                .fillMaxWidth(0.9f)
                .aspectRatio(0.8f),
            shape = RoundedCornerShape(16.dp),
            color = MaterialTheme.colorScheme.surface
        ) {
            Column(
                modifier = Modifier.fillMaxSize()
            ) {
                // 顶部栏
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(8.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "扫描二维码",
                        style = MaterialTheme.typography.titleMedium,
                        modifier = Modifier.padding(start = 8.dp)
                    )
                    Row {
                        // 闪光灯按钮
                        IconButton(
                            onClick = {
                                flashEnabled = !flashEnabled
                                scannerView?.let { view ->
                                    if (flashEnabled) {
                                        view.setTorchOn()
                                    } else {
                                        view.setTorchOff()
                                    }
                                }
                            }
                        ) {
                            Icon(
                                imageVector = if (flashEnabled) Icons.Default.FlashOn else Icons.Default.FlashOff,
                                contentDescription = if (flashEnabled) "关闭闪光灯" else "打开闪光灯"
                            )
                        }
                        // 关闭按钮
                        IconButton(onClick = onDismiss) {
                            Icon(Icons.Default.Close, contentDescription = "关闭")
                        }
                    }
                }
                
                // 扫描区域
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(16.dp)
                        .clip(RoundedCornerShape(8.dp))
                        .background(Color.Black),
                    contentAlignment = Alignment.Center
                ) {
                    if (hasPermission) {
                        AndroidView(
                            factory = { ctx ->
                                DecoratedBarcodeView(ctx).apply {
                                    scannerView = this
                                    
                                    // 配置扫描
                                    decodeContinuous(object : BarcodeCallback {
                                        override fun barcodeResult(result: BarcodeResult?) {
                                            result?.text?.let { text ->
                                                Log.d(TAG, "Scanned: $text")
                                                // 暂停扫描防止重复
                                                pause()
                                                onScanned(text)
                                            }
                                        }
                                    })
                                    
                                    // 开始预览
                                    resume()
                                }
                            },
                            modifier = Modifier.fillMaxSize(),
                            onRelease = { view ->
                                view.pause()
                            }
                        )
                        
                        // 扫描框指示器
                        ScannerOverlay()
                    } else {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.Center
                        ) {
                            Text(
                                text = "需要相机权限",
                                style = MaterialTheme.typography.bodyLarge,
                                color = Color.White
                            )
                            Spacer(modifier = Modifier.height(16.dp))
                            Button(
                                onClick = { permissionLauncher.launch(Manifest.permission.CAMERA) }
                            ) {
                                Text("授予权限")
                            }
                        }
                    }
                }
            }
        }
    }
    
    // 生命周期管理
    DisposableEffect(Unit) {
        onDispose {
            scannerView?.pause()
        }
    }
}

/**
 * 扫描框覆盖层
 */
@Composable
private fun ScannerOverlay() {
    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        // 半透明遮罩
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(Color.Black.copy(alpha = 0.3f))
        )
        
        // 扫描框
        Box(
            modifier = Modifier
                .size(220.dp)
                .background(Color.Transparent)
        ) {
            // 四个角的装饰线
            val cornerSize = 24.dp
            val cornerWidth = 3.dp
            val cornerColor = MaterialTheme.colorScheme.primary
            
            // 左上角
            Box(
                modifier = Modifier
                    .align(Alignment.TopStart)
                    .size(cornerSize)
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(cornerWidth)
                        .background(cornerColor)
                )
                Box(
                    modifier = Modifier
                        .fillMaxHeight()
                        .width(cornerWidth)
                        .background(cornerColor)
                )
            }
            
            // 右上角
            Box(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .size(cornerSize)
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(cornerWidth)
                        .background(cornerColor)
                )
                Box(
                    modifier = Modifier
                        .fillMaxHeight()
                        .width(cornerWidth)
                        .align(Alignment.TopEnd)
                        .background(cornerColor)
                )
            }
            
            // 左下角
            Box(
                modifier = Modifier
                    .align(Alignment.BottomStart)
                    .size(cornerSize)
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(cornerWidth)
                        .align(Alignment.BottomStart)
                        .background(cornerColor)
                )
                Box(
                    modifier = Modifier
                        .fillMaxHeight()
                        .width(cornerWidth)
                        .background(cornerColor)
                )
            }
            
            // 右下角
            Box(
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .size(cornerSize)
            ) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(cornerWidth)
                        .align(Alignment.BottomEnd)
                        .background(cornerColor)
                )
                Box(
                    modifier = Modifier
                        .fillMaxHeight()
                        .width(cornerWidth)
                        .align(Alignment.BottomEnd)
                        .background(cornerColor)
                )
            }
        }
        
        // 提示文字
        Text(
            text = "将二维码放入框内",
            style = MaterialTheme.typography.bodyMedium,
            color = Color.White,
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(bottom = 32.dp)
        )
    }
}
