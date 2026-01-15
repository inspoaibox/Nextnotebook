# Design Document - LAN Transfer Assistant

## Overview

局域网传输助手是一个独立的点对点文件和消息传输系统，基于 Socket.IO 实现设备间的实时通信。系统采用"局域网直连优先，中继服务器降级"的架构，确保在各种网络环境下都能正常工作。

核心特性：
- 无需登录认证，即开即用
- 支持桌面端和 Android 端互传
- 局域网内高速直连传输
- 跨网络中继服务器支持
- 文本消息和文件传输
- 完整的传输历史记录

## Architecture

### System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    LAN Transfer Assistant                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Desktop Client                        Android Client           │
│  ┌──────────────────┐                 ┌──────────────────┐     │
│  │ Transfer Panel   │                 │ Transfer Screen  │     │
│  │ - QR Code        │                 │ - QR Scanner     │     │
│  │ - Device List    │                 │ - Device List    │     │
│  │ - Chat UI        │                 │ - Chat UI        │     │
│  └────────┬─────────┘                 └────────┬─────────┘     │
│           │                                     │               │
│  ┌────────▼─────────┐                 ┌────────▼─────────┐     │
│  │ TransferClient   │                 │ TransferClient   │     │
│  │ (Socket.IO)      │                 │ (Socket.IO)      │     │
│  └────────┬─────────┘                 └────────┬─────────┘     │
│           │                                     │               │
│           │  Mode 1: LAN Direct Connection     │               │
│           └─────────────────────────────────────┘               │
│                                                                  │
│           │  Mode 2: Relay Server              │               │
│           └──────────┬──────────────────────────┘               │
│                      │                                          │
│           ┌──────────▼──────────┐                               │
│           │  Relay Server        │                               │
│           │  (Socket.IO Server)  │                               │
│           │  - Device Registry   │                               │
│           │  - Message Relay     │                               │
│           │  - File Relay        │                               │
│           └─────────────────────┘                               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Connection Modes

**Mode 1: LAN Direct Connection (Priority)**
- Desktop端启动内置 Socket.IO 服务器
- 监听随机端口（如 45678）
- 生成包含 IP:Port 的二维码
- Android 端扫码后直接连接
- 零延迟、高速传输

**Mode 2: Relay Server (Fallback)**
- 部署在现有同步服务器上
- 监听独立端口（默认 3002）
- 设备通过服务器中转消息
- 支持跨网络传输


## Components and Interfaces

### 0. Transfer Constants

**TransferConstants.ts** - 可配置常量

```typescript
export const TRANSFER_CONSTANTS = {
  // 文件传输
  CHUNK_SIZE: 64 * 1024,              // 64KB 分块大小
  MAX_FILE_SIZE: 100 * 1024 * 1024,   // 100MB 最大文件大小
  
  // 时间配置
  QR_CODE_EXPIRY: 5 * 60 * 1000,      // 5 分钟二维码过期
  SESSION_TIMEOUT: 30 * 60 * 1000,    // 30 分钟会话超时
  
  // 重试配置
  MAX_RETRY: 3,                        // 最大重试次数
  RETRY_INTERVAL: 1000,                // 1 秒重试间隔
  
  // 连接配置
  MAX_CONNECTIONS: 10,                 // 最大同时连接数
  PORT_RETRY_ATTEMPTS: 3,              // 端口冲突重试次数
  
  // 临时文件
  TEMP_FILE_CLEANUP_DELAY: 5000,       // 5 秒后清理临时文件
};

export enum TransferErrorCode {
  // 连接错误 (E001-E099)
  CONNECTION_FAILED = 'E001',
  CONNECTION_TIMEOUT = 'E002',
  PORT_IN_USE = 'E003',
  NETWORK_UNAVAILABLE = 'E004',
  
  // 配对错误 (E100-E199)
  QR_CODE_EXPIRED = 'E101',
  QR_CODE_INVALID = 'E102',
  DEVICE_ID_CONFLICT = 'E103',
  PAIRING_REJECTED = 'E104',
  
  // 传输错误 (E200-E299)
  FILE_TOO_LARGE = 'E201',
  FILE_NOT_FOUND = 'E202',
  FILE_READ_ERROR = 'E203',
  FILE_WRITE_ERROR = 'E204',
  DISK_SPACE_INSUFFICIENT = 'E205',
  TRANSFER_INTERRUPTED = 'E206',
  CHUNK_INTEGRITY_ERROR = 'E207',
  
  // 会话错误 (E300-E399)
  SESSION_NOT_FOUND = 'E301',
  SESSION_EXPIRED = 'E302',
  SESSION_CLOSED = 'E303',
  
  // 服务器错误 (E400-E499)
  SERVER_START_FAILED = 'E401',
  SERVER_FULL = 'E402',
  RELAY_SERVER_UNAVAILABLE = 'E403',
  
  // 权限错误 (E500-E599)
  PERMISSION_DENIED = 'E501',
  FILE_ACCESS_DENIED = 'E502',
  CAMERA_PERMISSION_DENIED = 'E503',
  
  // 未知错误
  UNKNOWN_ERROR = 'E999',
}

export interface TransferError {
  code: TransferErrorCode;
  message: string;
  details?: any;
  timestamp: number;
}
```

### 1. Desktop Transfer Server (Main Process)

**TransferServer.ts** - 内置 Socket.IO 服务器

```typescript
interface TransferServerConfig {
  port?: number;                    // 0 = 随机端口
  maxConnections?: number;          // 最大连接数，默认 10
  maxFileSize?: number;             // 最大文件大小，默认 100MB
  chunkSize?: number;               // 分块大小，默认 64KB
  sessionTimeout?: number;          // 会话超时，默认 30 分钟
  enableRelay?: boolean;            // 是否启用中继服务器
  relayServerUrl?: string;          // 中继服务器 URL
}

interface ServerInfo {
  port: number;
  ip: string;
  deviceId: string;
  deviceName: string;
  maxConnections: number;
  currentConnections: number;
}

class TransferServer {
  async start(config?: TransferServerConfig): Promise<ServerInfo>
  async stop(): Promise<void>
  getConnectedDevices(): Device[]
  getServerInfo(): ServerInfo
  on(event: string, handler: Function): void
}

```

### 2. Transfer Client (Renderer/Android)

**TransferClient.ts / TransferClient.kt** - Socket.IO 客户端

```typescript
interface ConnectionConfig {
  mode: 'lan' | 'relay';
  host: string;
  port: number;
  deviceId: string;
  deviceName: string;
}

interface PairingData {
  deviceId: string;
  deviceName: string;
  serverIp: string;
  serverPort: number;
  timestamp: number;
  expiresAt: number;
}

class TransferClient {
  async connect(config: ConnectionConfig): Promise<void>
  async disconnect(): Promise<void>
  async sendTextMessage(sessionId: string, text: string): Promise<Message>
  async sendFile(sessionId: string, filePath: string): Promise<void>
  generatePairingQRCode(serverInfo: ServerInfo): Promise<string>
  parsePairingQRCode(qrData: string): PairingData
  on(event: string, handler: Function): void
}
```

### 3. Transfer Database (Local Storage)

**TransferDatabase.ts / TransferDatabase.kt** - 独立的本地数据库

**数据库架构决策**：
- Transfer 使用**独立的 SQLite 数据库文件** (`transfer.db`)，与主应用数据库 (`mucheng-notes.db`) 分离
- 理由：
  1. Transfer 是完全独立的功能模块，不依赖笔记数据
  2. 便于数据隔离、备份和清理
  3. 避免污染主数据库 schema
  4. 符合"功能独立"的设计原则
- 数据库初始化时机：首次启动 TransferServer 时自动创建

```sql
-- 设备表
CREATE TABLE transfer_devices (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,  -- 'desktop' | 'android'
  last_ip TEXT,
  last_port INTEGER,
  last_seen INTEGER NOT NULL,
  is_favorite INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- 会话表
CREATE TABLE transfer_sessions (
  id TEXT PRIMARY KEY,
  peer_device_id TEXT NOT NULL,
  peer_device_name TEXT NOT NULL,
  connection_type TEXT NOT NULL,  -- 'lan' | 'relay'
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  FOREIGN KEY (peer_device_id) REFERENCES transfer_devices(id)
);

-- 消息表
CREATE TABLE transfer_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  direction TEXT NOT NULL,  -- 'sent' | 'received'
  type TEXT NOT NULL,  -- 'text' | 'file' | 'image'
  content TEXT NOT NULL,
  file_id TEXT,
  created_at INTEGER NOT NULL,
  read_at INTEGER,
  FOREIGN KEY (session_id) REFERENCES transfer_sessions(id),
  FOREIGN KEY (file_id) REFERENCES transfer_files(id)
);

-- 文件传输表
CREATE TABLE transfer_files (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  local_path TEXT,
  direction TEXT NOT NULL,  -- 'sent' | 'received'
  status TEXT NOT NULL,  -- 'pending' | 'transferring' | 'completed' | 'failed'
  progress REAL DEFAULT 0,
  created_at INTEGER NOT NULL,
  completed_at INTEGER,
  FOREIGN KEY (session_id) REFERENCES transfer_sessions(id)
);
```

### 4. Relay Server (Optional)

**relay-server/index.ts** - 中继服务器

```typescript
interface RelayServerConfig {
  port: number;
  corsOrigins: string[];
}

class RelayServer {
  async start(config: RelayServerConfig): Promise<void>
  async stop(): Promise<void>
  getOnlineDevices(): Device[]
}
```



## Data Models

### Device Model

```typescript
interface Device {
  id: string;              // UUID
  name: string;            // 设备名称
  type: 'desktop' | 'android';
  lastIp?: string;         // 最后连接的 IP
  lastPort?: number;       // 最后连接的端口
  lastSeen: number;        // 最后在线时间戳
  isFavorite: boolean;     // 是否常用设备
  createdAt: number;       // 创建时间戳
}
```

### Session Model

```typescript
interface Session {
  id: string;              // UUID
  peerDeviceId: string;    // 对端设备 ID
  peerDeviceName: string;  // 对端设备名称
  connectionType: 'lan' | 'relay';
  startedAt: number;       // 会话开始时间
  endedAt?: number;        // 会话结束时间
}
```

### Message Model

```typescript
interface Message {
  id: string;              // UUID
  sessionId: string;       // 所属会话 ID
  direction: 'sent' | 'received';
  type: 'text' | 'file' | 'image';
  content: string;         // 文本内容或文件元数据 JSON
  fileId?: string;         // 关联的文件 ID
  createdAt: number;       // 创建时间戳
  readAt?: number;         // 已读时间戳
}
```

### File Transfer Model

```typescript
interface FileTransfer {
  id: string;              // UUID
  sessionId: string;       // 所属会话 ID
  filename: string;        // 文件名
  fileSize: number;        // 文件大小（字节）
  mimeType: string;        // MIME 类型
  localPath?: string;      // 本地文件路径
  direction: 'sent' | 'received';
  status: 'pending' | 'transferring' | 'completed' | 'failed';
  progress: number;        // 进度 0-100
  createdAt: number;       // 创建时间戳
  completedAt?: number;    // 完成时间戳
}
```



## Socket.IO Event Protocol

### Client to Server Events

```typescript
interface ClientToServerEvents {
  // 设备注册
  'device:register': (data: {
    deviceId: string;
    deviceName: string;
    deviceType: 'desktop' | 'android';
    version: string;
  }) => void;

  // 配对请求
  'pair:request': (data: {
    targetDeviceId: string;
    pairingCode?: string;
  }) => void;

  // 配对响应
  'pair:accept': (data: { requestId: string }) => void;
  'pair:reject': (data: { requestId: string }) => void;

  // 发送消息
  'message:send': (data: {
    sessionId: string;
    type: 'text' | 'file' | 'image';
    content: string;
    metadata?: any;
  }) => void;

  // 文件传输
  'file:start': (data: {
    fileId: string;
    filename: string;
    fileSize: number;
    mimeType: string;
  }) => void;

  'file:chunk': (data: {
    fileId: string;
    chunk: ArrayBuffer;
    offset: number;
  }) => void;

  'file:complete': (data: { fileId: string }) => void;

  // 消息已读
  'message:read': (data: { messageIds: string[] }) => void;
}
```

### Server to Client Events

```typescript
interface ServerToClientEvents {
  // 设备列表
  'device:list': (devices: Device[]) => void;

  // 设备上线/下线
  'device:online': (device: Device) => void;
  'device:offline': (deviceId: string) => void;

  // 配对请求
  'pair:request': (data: {
    requestId: string;
    fromDevice: Device;
  }) => void;

  // 配对成功
  'pair:success': (data: {
    sessionId: string;
    peerDevice: Device;
  }) => void;

  // 接收消息
  'message:receive': (message: Message) => void;

  // 文件传输
  'file:incoming': (data: {
    fileId: string;
    filename: string;
    fileSize: number;
    mimeType: string;
  }) => void;

  'file:chunk': (data: {
    fileId: string;
    chunk: ArrayBuffer;
    offset: number;
  }) => void;

  'file:complete': (data: { fileId: string }) => void;

  'file:progress': (data: {
    fileId: string;
    progress: number;
  }) => void;

  // 错误
  'error': (error: {
    code: string;
    message: string;
  }) => void;
}
```



## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Device Registration Uniqueness

*For any* device connecting to the transfer system, the device ID should be unique and persistent across sessions.

**Validates: Requirements 1.1, 7.1**

### Property 2: QR Code Expiration

*For any* generated pairing QR code, scanning after the expiration time (5 minutes) should result in connection rejection.

**Validates: Requirements 1.3, 9.1, 9.2**

### Property 3: Message Delivery Order

*For any* sequence of messages sent in a session, the messages should be received in the same order they were sent.

**Validates: Requirements 4.1, 4.2**

### Property 4: File Chunk Integrity

*For any* file transfer, all chunks should be received and assembled in the correct order, resulting in a file identical to the original.

**Validates: Requirements 5.3, 5.4, 5.5, 5.6**

### Property 5: Session Persistence

*For any* established session, all messages and file transfers should be persisted to the local database before acknowledgment.

**Validates: Requirements 4.3, 4.4, 6.2, 6.3**

### Property 6: Connection Mode Fallback

*For any* connection attempt, if LAN direct connection fails, the system should automatically attempt relay server connection.

**Validates: Requirements 3.1, 3.2**

### Property 7: Device List Consistency

*For any* connected device, the device should appear in the device list of all other connected devices within 1 second.

**Validates: Requirements 1.4, 8.3**

### Property 8: File Transfer Progress Accuracy

*For any* file transfer in progress, the reported progress percentage should match the ratio of bytes transferred to total file size.

**Validates: Requirements 2.5, 5.7**

### Property 9: Temporary File Cleanup

*For any* failed or completed file transfer, temporary files should be cleaned up within 5 seconds.

**Validates: Requirements 5.8, 9.3**

### Property 10: Message Read Receipt

*For any* message marked as read by the user, a read receipt should be sent to the sender within 1 second.

**Validates: Requirements 4.5**



## Error Handling

### Connection Errors

1. **LAN Connection Failed** (E001)
   - Retry 3 times with 1-second intervals
   - Fall back to relay server if configured
   - Display error message if both fail
   - Error: `{ code: 'E001', message: 'Failed to connect to device' }`

2. **Port In Use** (E003)
   - Attempt 3 different random ports
   - If all fail, prompt user to close conflicting applications
   - Error: `{ code: 'E003', message: 'Port already in use, retrying...' }`

3. **Relay Server Unreachable** (E403)
   - Display offline status
   - Queue messages for retry
   - Notify user of connection issues
   - Error: `{ code: 'E403', message: 'Relay server unavailable' }`

4. **QR Code Scan Errors**
   - Invalid format (E102): Show "Invalid QR code" message
   - Expired code (E101): Show "QR code expired, please regenerate"
   - Connection failed (E001): Show "Unable to connect to device"

5. **Network Unavailable** (E004)
   - Detect network state changes (WiFi → Mobile Data)
   - Attempt automatic reconnection
   - Notify user of network change

### Transfer Errors

1. **File Too Large** (E201)
   - Check file size before transfer
   - Reject files exceeding MAX_FILE_SIZE (100MB)
   - Error: `{ code: 'E201', message: 'File exceeds 100MB limit', details: { fileSize, maxSize } }`

2. **File Transfer Interrupted** (E206)
   - Save progress to database
   - Allow resume from last successful chunk
   - Clean up temporary files after 3 failed retries
   - Error: `{ code: 'E206', message: 'Transfer interrupted', details: { progress, chunkIndex } }`

3. **Chunk Integrity Error** (E207)
   - Verify chunk hash on receive
   - Request retransmission of corrupted chunk
   - Error: `{ code: 'E207', message: 'Chunk integrity check failed', details: { chunkIndex } }`

4. **Message Send Failed** (E206)
   - Retry 3 times with exponential backoff (1s, 2s, 4s)
   - Mark message as failed in database
   - Allow manual retry

5. **Disk Space Insufficient** (E205)
   - Check available space before accepting file
   - Reject transfer with clear error message
   - Clean up partial downloads
   - Error: `{ code: 'E205', message: 'Insufficient disk space', details: { required, available } }`

6. **File Access Denied** (E502)
   - Check file permissions before read/write
   - Prompt user to grant permissions (Android)
   - Error: `{ code: 'E502', message: 'Cannot access file', details: { filePath } }`

### Network State Changes

1. **WiFi to Mobile Data**
   - Detect network interface change
   - Attempt to maintain connection (if relay server available)
   - Notify user of network change
   - Auto-reconnect if connection drops

2. **Network Disconnected**
   - Queue pending messages
   - Pause file transfers
   - Show offline indicator
   - Auto-resume when network returns

3. **Network Reconnected**
   - Attempt to reconnect to last session
   - Resume pending file transfers
   - Sync queued messages
   - Update connection status

**Implementation**:
- Desktop: Monitor `navigator.onLine` and network interface changes
- Android: Use `ConnectivityManager.NetworkCallback`
- Relay server: Implement heartbeat mechanism (ping every 30s)

1. **Peer Device Disconnected** (E303)
   - Mark session as ended
   - Save all pending messages
   - Notify user of disconnection
   - Error: `{ code: 'E303', message: 'Device disconnected', details: { deviceId } }`

2. **Session Timeout** (E302)
   - Close inactive sessions after 30 minutes
   - Clean up resources
   - Allow reconnection with same device
   - Error: `{ code: 'E302', message: 'Session expired due to inactivity' }`

3. **Session Not Found** (E301)
   - Validate session ID before operations
   - Prompt user to reconnect
   - Error: `{ code: 'E301', message: 'Session not found', details: { sessionId } }`

### Error Handling Matrix

| Error Code | Retry | Fallback | User Action | Auto-Recovery |
|-----------|-------|----------|-------------|---------------|
| E001 | ✅ 3x | Relay Server | None | Yes |
| E003 | ✅ 3x | Different Port | Close Apps | Yes |
| E101 | ❌ | None | Regenerate QR | No |
| E201 | ❌ | None | Reduce File Size | No |
| E205 | ❌ | None | Free Space | No |
| E206 | ✅ 3x | Resume Transfer | Manual Retry | Yes |
| E302 | ❌ | None | Reconnect | No |
| E403 | ✅ 5x | None | Check Network | Yes |
| E502 | ❌ | None | Grant Permission | No |



## Testing Strategy

### Unit Tests

Unit tests verify specific components and edge cases:

1. **QR Code Generation/Parsing**
   - Valid QR code format
   - Expiration time calculation
   - Invalid data handling

2. **File Chunking**
   - Correct chunk size (64KB)
   - Last chunk handling
   - Empty file handling

3. **Database Operations**
   - CRUD operations for all tables
   - Foreign key constraints
   - Transaction rollback

4. **Message Serialization**
   - JSON encoding/decoding
   - Binary data handling
   - Unicode text support

### Property-Based Tests

Property-based tests verify universal correctness properties across many generated inputs. Each test should run a minimum of 100 iterations.

1. **Property 1: Device Registration Uniqueness**
   - **Feature: lan-transfer, Property 1: Device Registration Uniqueness**
   - Generate random device registrations
   - Verify each device ID is unique in the registry

2. **Property 2: QR Code Expiration**
   - **Feature: lan-transfer, Property 2: QR Code Expiration**
   - Generate QR codes with random timestamps
   - Verify expired codes are rejected

3. **Property 3: Message Delivery Order**
   - **Feature: lan-transfer, Property 3: Message Delivery Order**
   - Send random sequences of messages
   - Verify received order matches sent order

4. **Property 4: File Chunk Integrity**
   - **Feature: lan-transfer, Property 4: File Chunk Integrity**
   - Generate random files of various sizes
   - Chunk, transfer, and reassemble
   - Verify hash matches original

5. **Property 5: Session Persistence**
   - **Feature: lan-transfer, Property 5: Session Persistence**
   - Create random sessions with messages
   - Verify all data persisted to database

6. **Property 6: Connection Mode Fallback**
   - **Feature: lan-transfer, Property 6: Connection Mode Fallback**
   - Simulate LAN connection failures
   - Verify relay connection attempted

7. **Property 7: Device List Consistency**
   - **Feature: lan-transfer, Property 7: Device List Consistency**
   - Connect random devices
   - Verify all devices see consistent list

8. **Property 8: File Transfer Progress Accuracy**
   - **Feature: lan-transfer, Property 8: File Transfer Progress Accuracy**
   - Transfer files of random sizes
   - Verify progress percentage accuracy

9. **Property 9: Temporary File Cleanup**
   - **Feature: lan-transfer, Property 9: Temporary File Cleanup**
   - Simulate failed transfers
   - Verify temp files cleaned up

10. **Property 10: Message Read Receipt**
    - **Feature: lan-transfer, Property 10: Message Read Receipt**
    - Mark random messages as read
    - Verify receipts sent to sender

### Integration Tests

1. **End-to-End Transfer**
   - Desktop to Android file transfer
   - Android to Desktop message transfer
   - Bidirectional communication

2. **Relay Server Integration**
   - Connect through relay server
   - Message forwarding
   - Device discovery

3. **Connection Mode Switching**
   - Start with LAN connection
   - Simulate network change
   - Verify fallback to relay

### Testing Framework

- **Desktop (TypeScript)**: Jest + fast-check for property-based testing
- **Android (Kotlin)**: JUnit + Kotest for property-based testing
- **Relay Server**: Jest + Supertest for API testing



## UI Integration

### Desktop Integration

**Sidebar Button** - 在 Sidebar.tsx 中添加传输助手按钮

```typescript
// 在工具栏区域添加传输按钮
{transferEnabled && (
  <Tooltip title="传输助手">
    <Button
      type={currentTool === 'transfer' ? 'primary' : 'text'}
      icon={<SwapOutlined />}
      size="small"
      onClick={() => onSelectTool?.(currentTool === 'transfer' ? null : 'transfer')}
    />
  </Tooltip>
)}
```

**Transfer Panel Component** - src/renderer/components/TransferPanel.tsx

```typescript
interface TransferPanelProps {
  onClose?: () => void;
}

const TransferPanel: React.FC<TransferPanelProps> = ({ onClose }) => {
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);
  const [qrCode, setQRCode] = useState<string>('');
  const [devices, setDevices] = useState<Device[]>([]);
  const [currentSession, setCurrentSession] = useState<Session | null>(null);
  
  return (
    <div className="transfer-panel">
      {!currentSession ? (
        <DeviceListView 
          serverInfo={serverInfo}
          qrCode={qrCode}
          devices={devices}
          onSelectDevice={handleSelectDevice}
        />
      ) : (
        <ChatView 
          session={currentSession}
          onBack={() => setCurrentSession(null)}
        />
      )}
    </div>
  );
};
```

### Android Integration

**Navigation Item** - 在 MainNavigation.kt 中添加传输助手导航项

```kotlin
object Transfer : Screen(
    "transfer", 
    R.string.nav_transfer, 
    Icons.Default.SwapHoriz,
    "transfer"
)

// 添加到 featureNavItems
val featureNavItems = listOf(
    Screen.Notes,
    Screen.Bookmarks,
    Screen.Todos,
    Screen.AI,
    Screen.Vault,
    Screen.Transfer  // 新增
)
```

**Transfer Screen** - TransferScreen.kt

```kotlin
@Composable
fun TransferScreen(
    navController: NavHostController,
    bottomPadding: PaddingValues
) {
    val viewModel: TransferViewModel = hiltViewModel()
    val uiState by viewModel.uiState.collectAsState()
    
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("传输助手") },
                actions = {
                    IconButton(onClick = { /* 扫码 */ }) {
                        Icon(Icons.Default.QrCodeScanner, "扫码")
                    }
                }
            )
        }
    ) { padding ->
        if (uiState.currentSession == null) {
            DeviceListView(
                devices = uiState.devices,
                onScanQR = { viewModel.scanQRCode() },
                onSelectDevice = { viewModel.connectToDevice(it) }
            )
        } else {
            ChatView(
                session = uiState.currentSession!!,
                messages = uiState.messages,
                onSendMessage = { viewModel.sendMessage(it) },
                onSendFile = { viewModel.sendFile(it) },
                onBack = { viewModel.endSession() }
            )
        }
    }
}
```



## Relay Server Deployment

### Integration with Existing Sync Server

中继服务器可以部署在现有的同步服务器上，复用基础设施：

**sync-server/src/transfer/relay.ts** - 中继服务器模块

```typescript
import { Server as SocketIOServer } from 'socket.io';
import { Server as HttpServer } from 'http';

export class TransferRelayServer {
  private io: SocketIOServer;
  private devices = new Map<string, DeviceInfo>();
  
  constructor(httpServer: HttpServer) {
    this.io = new SocketIOServer(httpServer, {
      path: '/transfer',
      cors: { origin: '*' },
      maxHttpBufferSize: 10 * 1024 * 1024,  // 10MB
    });
    
    this.setupHandlers();
  }
  
  private setupHandlers() {
    this.io.on('connection', (socket) => {
      // 设备注册
      socket.on('device:register', (data) => {
        this.devices.set(socket.id, {
          socketId: socket.id,
          ...data,
          connectedAt: Date.now(),
        });
        this.broadcastDeviceList();
      });
      
      // 消息转发
      socket.on('message:send', (data) => {
        const targetSocket = this.findTargetSocket(data.sessionId);
        if (targetSocket) {
          this.io.to(targetSocket).emit('message:receive', data);
        }
      });
      
      // 文件分块转发
      socket.on('file:chunk', (data) => {
        const targetSocket = this.findTargetSocket(data.sessionId);
        if (targetSocket) {
          this.io.to(targetSocket).emit('file:chunk', data);
        }
      });
      
      // 断开连接
      socket.on('disconnect', () => {
        this.devices.delete(socket.id);
        this.broadcastDeviceList();
      });
    });
  }
  
  private broadcastDeviceList() {
    const deviceList = Array.from(this.devices.values()).map(d => ({
      deviceId: d.deviceId,
      deviceName: d.deviceName,
      deviceType: d.deviceType,
    }));
    this.io.emit('device:list', deviceList);
  }
  
  private findTargetSocket(sessionId: string): string | null {
    // 根据 sessionId 查找目标设备的 socket ID
    // 实现逻辑...
    return null;
  }
}
```

**sync-server/src/index.ts** - 集成到主服务器

```typescript
import { TransferRelayServer } from './transfer/relay';

// 在现有 HTTP 服务器上启动中继服务
const transferRelay = new TransferRelayServer(httpServer);
console.log('Transfer relay server started on /transfer');
```

### Environment Configuration

**.env** - 添加传输助手配置

```bash
# Transfer Relay Server
TRANSFER_RELAY_ENABLED=true
TRANSFER_RELAY_PATH=/transfer
TRANSFER_MAX_FILE_SIZE=104857600  # 100MB
```

### Docker Deployment

**docker-compose.yml** - 更新配置

```yaml
services:
  sync-server:
    environment:
      - TRANSFER_RELAY_ENABLED=true
      - TRANSFER_RELAY_PATH=/transfer
    ports:
      - "3000:3000"  # 同步服务器
      # 传输中继使用相同端口，通过 path 区分
```



## Security Considerations

### Data Privacy

1. **No Server-Side Storage**
   - 中继服务器不存储任何消息或文件内容
   - 仅转发数据，不记录日志
   - 设备断开后立即清除所有会话信息

2. **Local-Only History**
   - 所有传输历史仅存储在本地设备
   - 用户可随时清除历史记录
   - 不同步到云端

3. **Temporary File Handling**
   - 接收的文件先保存到临时目录
   - 传输完成后移动到用户指定位置
   - 失败的传输自动清理临时文件

### Network Security

1. **QR Code Expiration**
   - 二维码包含时间戳和过期时间
   - 默认 5 分钟后过期
   - 防止旧二维码被滥用

2. **Connection Validation**
   - 验证设备 ID 格式（UUID）
   - 检查连接来源
   - 限制同时连接数

3. **Rate Limiting**
   - 限制消息发送频率
   - 限制文件传输并发数
   - 防止资源耗尽攻击

### Future Enhancements (Optional)

1. **End-to-End Encryption**
   - 使用设备公钥加密传输内容
   - 仅在设备间交换密钥
   - 中继服务器无法解密内容

2. **Device Authentication**
   - 首次配对时交换设备指纹
   - 后续连接验证设备身份
   - 防止中间人攻击

