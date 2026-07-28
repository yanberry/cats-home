' Safe House - Silent background launcher
' Use this for auto-start on Windows login

Set WshShell = CreateObject("WScript.Shell")

' Switch to script directory
scriptDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = scriptDir

' Check if Node.js is installed
Dim nodeCheck
nodeCheck = WshShell.Run("cmd /c node --version >nul 2>&1", 0, True)
If nodeCheck <> 0 Then
    WshShell.Popup "Node.js not found. Please install from https://nodejs.org", 0, "Safe House", 48
    WScript.Quit 1
End If

' Start server silently (no window)
WshShell.Run "node server.js", 0, False

' Wait for server to start
WScript.Sleep 2000

' Open browser
WshShell.Run "http://localhost:3000", 1, False
