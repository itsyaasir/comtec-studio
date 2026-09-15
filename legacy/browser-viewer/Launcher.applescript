on run
    set launcherPath to (POSIX path of (path to home folder)) & "Applications/COMTEC Viewer/Start Viewer.command"
    do shell script "/usr/bin/open -a Terminal " & quoted form of launcherPath
end run
