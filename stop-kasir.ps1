# Finds whatever is listening on the backend/frontend ports, walks up its
# process tree to the top-most cmd.exe ancestor (the console window
# buka-kasir.bat opened with `start "..." cmd /k ...`), and kills that whole
# tree with taskkill /t /f.
#
# Why not just kill the listening PID directly: uv/npm/node run several
# levels below the cmd.exe window that `start` created (cmd.exe -> uv/npm ->
# python/node). `taskkill /t` only kills a PID's descendants, never its
# ancestors, so killing the leaf process alone stops the app but leaves the
# now-empty console window open. Walking up to the top cmd.exe first and
# killing *that* tree takes the window down along with everything under it.
#
# Called from tutup-kasir.bat -- not meant to be run standalone, though it's
# harmless to do so (it just no-ops if nothing is listening on the ports).

$ports = 8000, 3000

foreach ($port in $ports) {
    $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    foreach ($conn in $conns) {
        $targetPid = $conn.OwningProcess
        $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$targetPid" -ErrorAction SilentlyContinue
        while ($proc -and $proc.ParentProcessId) {
            $parent = Get-CimInstance Win32_Process -Filter "ProcessId=$($proc.ParentProcessId)" -ErrorAction SilentlyContinue
            if (-not $parent) { break }
            if ($parent.Name -eq 'cmd.exe') { $targetPid = $parent.ProcessId }
            $proc = $parent
        }
        taskkill /pid $targetPid /t /f 2>$null | Out-Null
    }
}
