' Runs start.bat with no visible console window.
Set sh = CreateObject("WScript.Shell")
batPath = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\")) & "start.bat"
sh.Run """" & batPath & """", 0, False
