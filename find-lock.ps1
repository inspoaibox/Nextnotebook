# 用 Restart Manager API 查找占用指定文件/目录的进程
$ErrorActionPreference = 'Stop'
$signature = @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

public static class RmHelp
{
    [StructLayout(LayoutKind.Sequential)]
    public struct RM_UNIQUE_PROCESS {
        public int dwProcessId;
        public System.Runtime.InteropServices.ComTypes.FILETIME ProcessStartTime;
    }

    [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
    public struct RM_PROCESS_INFO {
        public RM_UNIQUE_PROCESS Process;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst=256)] public string strAppName;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst=64)]  public string strServiceShortName;
        public uint ApplicationType;
        public uint AppStatus;
        public uint TSSessionId;
        [MarshalAs(UnmanagedType.Bool)] public bool bRestartable;
    }

    [DllImport("rstrtmgr.dll", CharSet=CharSet.Unicode)]
    public static extern int RmStartSession(out uint pSessionHandle, int dwSessionFlags, string strSessionKey);

    [DllImport("rstrtmgr.dll")]
    public static extern int RmEndSession(uint pSessionHandle);

    [DllImport("rstrtmgr.dll", CharSet=CharSet.Unicode)]
    public static extern int RmRegisterResources(uint pSessionHandle,
        uint nFiles, string[] rgsFilenames,
        uint nApplications, [In] RM_UNIQUE_PROCESS[] rgApplications,
        uint nServices, string[] rgsServiceNames);

    [DllImport("rstrtmgr.dll")]
    public static extern int RmGetList(uint dwSessionHandle, out uint pnProcInfoNeeded,
        ref uint pnProcInfo, [In, Out] RM_PROCESS_INFO[] rgAffectedApps,
        ref uint lpdwRebootReasons);

    public static List<int> FindLockers(string[] files) {
        var result = new List<int>();
        uint handle;
        int rc = RmStartSession(out handle, 0, Guid.NewGuid().ToString());
        if (rc != 0) throw new Exception("RmStartSession failed: " + rc);
        try {
            rc = RmRegisterResources(handle, (uint)files.Length, files, 0, null, 0, null);
            if (rc != 0) throw new Exception("RmRegisterResources failed: " + rc);

            uint pnProcInfoNeeded = 0;
            uint pnProcInfo = 0;
            uint reasons = 0;
            rc = RmGetList(handle, out pnProcInfoNeeded, ref pnProcInfo, null, ref reasons);
            if (rc == 234 /*ERROR_MORE_DATA*/) {
                var info = new RM_PROCESS_INFO[pnProcInfoNeeded];
                pnProcInfo = pnProcInfoNeeded;
                rc = RmGetList(handle, out pnProcInfoNeeded, ref pnProcInfo, info, ref reasons);
                if (rc != 0) throw new Exception("RmGetList(2) failed: " + rc);
                for (int i = 0; i < pnProcInfo; i++) {
                    result.Add(info[i].Process.dwProcessId);
                }
            }
            return result;
        } finally {
            RmEndSession(handle);
        }
    }
}
'@
Add-Type -TypeDefinition $signature -Language CSharp

$targets = @(
    'D:\website\Nextnotebook\release\win-unpacked\resources\app.asar',
    'D:\website\Nextnotebook\release\win-unpacked',
    'D:\website\Nextnotebook\release'
)
$pids = [RmHelp]::FindLockers($targets)
if ($pids.Count -eq 0) {
    Write-Host "Restart Manager: 没有进程占用这些目标 (锁可能来自句柄已释放但目录仍受保护)"
} else {
    Write-Host ("Restart Manager 找到 {0} 个占用进程:" -f $pids.Count)
    foreach ($p in $pids) {
        $proc = Get-Process -Id $p -ErrorAction SilentlyContinue
        if ($proc) {
            Write-Host ("PID={0}  Name={1}  Path={2}" -f $p, $proc.ProcessName, $proc.Path)
        } else {
            Write-Host ("PID={0}  (进程已退出)" -f $p)
        }
    }
}
