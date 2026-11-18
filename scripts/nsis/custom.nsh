; electron-builder 的默认「应用正在运行」检测（templates/nsis/include/allowOnlyOneInstallerInstance.nsh）：
;
;   Get-CimInstance Win32_Process | ? { $_.Path.StartsWith('$INSTDIR') } ...
;
; 它判断的依据不是进程名，而是「进程路径以安装目录开头」。于是：
;   - 安装包自己就放在安装目录里时，会把安装程序算成「Corpus 正在运行」；
;   - 安装目录选在项目目录（D:\code-tasks\Corpus）时，开发用的 node/electron 也会被算进去。
; 结果就是「无法关闭 Corpus，请手动关闭后重试」死循环，点重试后继续装又撞上文件被占用。
;
; 这里把检测整个跳过：安装前自己确认没有 Corpus.exe 在跑即可。
; 代价是应用真在运行时不会提示，而是复制文件阶段直接报错。
!macro customCheckAppRunning
!macroend
