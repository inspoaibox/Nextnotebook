package com.mucheng.notes.data.sync

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import androidx.core.content.getSystemService
import com.mucheng.notes.domain.repository.SyncRepository
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.launch
import javax.inject.Inject
import javax.inject.Singleton

/**
 * 离线队列管理器接口
 */
interface OfflineQueueManager {
    /**
     * 检查当前是否在线
     */
    fun isOnline(): Boolean
    
    /**
     * 观察网络连接状态
     */
    fun observeConnectivity(): Flow<Boolean>
    
    /**
     * 获取当前连接状态
     */
    fun getConnectivityState(): StateFlow<Boolean>
    
    /**
     * 处理队列（网络恢复时自动触发同步）
     */
    suspend fun processQueue()
    
    /**
     * 启动网络监听
     */
    fun startMonitoring()
    
    /**
     * 停止网络监听
     */
    fun stopMonitoring()
}

/**
 * 离线队列管理器实现
 * 
 * 监听网络状态变化，在网络恢复时自动触发同步。
 */
@Singleton
class OfflineQueueManagerImpl @Inject constructor(
    @ApplicationContext private val context: Context
) : OfflineQueueManager {
    
    private val connectivityManager = context.getSystemService<ConnectivityManager>()
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    
    private val _connectivityState = MutableStateFlow(checkNetworkAvailable())
    
    private var networkCallback: ConnectivityManager.NetworkCallback? = null
    private var syncRepository: SyncRepository? = null
    
    /**
     * 设置 SyncRepository（避免循环依赖）
     */
    fun setSyncRepository(repository: SyncRepository) {
        syncRepository = repository
    }
    
    override fun isOnline(): Boolean = checkNetworkAvailable()
    
    override fun observeConnectivity(): Flow<Boolean> = callbackFlow {
        val callback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                trySend(true)
                // 网络恢复时自动触发同步
                scope.launch {
                    processQueue()
                }
            }
            
            override fun onLost(network: Network) {
                trySend(false)
            }
            
            override fun onCapabilitiesChanged(
                network: Network,
                networkCapabilities: NetworkCapabilities
            ) {
                val hasInternet = networkCapabilities.hasCapability(
                    NetworkCapabilities.NET_CAPABILITY_INTERNET
                )
                trySend(hasInternet)
            }
        }
        
        val request = NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .build()
        
        connectivityManager?.registerNetworkCallback(request, callback)
        
        // 发送初始状态
        trySend(checkNetworkAvailable())
        
        awaitClose {
            connectivityManager?.unregisterNetworkCallback(callback)
        }
    }
    
    override fun getConnectivityState(): StateFlow<Boolean> = _connectivityState.asStateFlow()
    
    override suspend fun processQueue() {
        if (isOnline()) {
            try {
                syncRepository?.sync()
            } catch (e: Exception) {
                // 同步失败，下次网络恢复时重试
            }
        }
    }
    
    override fun startMonitoring() {
        if (networkCallback != null) return
        
        networkCallback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                _connectivityState.value = true
                // 网络恢复时自动触发同步
                scope.launch {
                    processQueue()
                }
            }
            
            override fun onLost(network: Network) {
                _connectivityState.value = false
            }
            
            override fun onCapabilitiesChanged(
                network: Network,
                networkCapabilities: NetworkCapabilities
            ) {
                val hasInternet = networkCapabilities.hasCapability(
                    NetworkCapabilities.NET_CAPABILITY_INTERNET
                )
                _connectivityState.value = hasInternet
            }
        }
        
        val request = NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .build()
        
        connectivityManager?.registerNetworkCallback(request, networkCallback!!)
    }
    
    override fun stopMonitoring() {
        networkCallback?.let {
            connectivityManager?.unregisterNetworkCallback(it)
            networkCallback = null
        }
    }
    
    /**
     * 检查网络是否可用
     */
    private fun checkNetworkAvailable(): Boolean {
        val network = connectivityManager?.activeNetwork ?: return false
        val capabilities = connectivityManager.getNetworkCapabilities(network) ?: return false
        
        return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
               capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
    }
}
