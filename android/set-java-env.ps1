# 设置 JAVA_HOME 为 JDK 17
[System.Environment]::SetEnvironmentVariable('JAVA_HOME', 'C:\Program Files\Java\jdk-17.0.18', 'Machine')

# 获取当前 PATH
$machinePath = [System.Environment]::GetEnvironmentVariable('Path', 'Machine')

# 移除旧的 Java 路径
$machinePath = $machinePath -replace 'C:\\Program Files \(x86\)\\Common Files\\Oracle\\Java\\javapath;', ''

# 添加新的 Java 路径到最前面
$newPath = 'C:\Program Files\Java\jdk-17.0.18\bin;' + $machinePath
[System.Environment]::SetEnvironmentVariable('Path', $newPath, 'Machine')

Write-Host "环境变量已更新，请重启 PowerShell 后运行 java -version 验证"
