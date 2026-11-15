; Colored Lens Studio for Windows (Inno Setup 6). Built by .github/workflows/release.yml:
;   iscc /DVersion=x.y.z /DRoot=<repo> installer\windows\ColoredLensStudio.iss
#ifndef Version
  #define Version "0.0.0"
#endif
#ifndef Root
  #define Root "..\.."
#endif

[Setup]
AppId={{6E7B3E9C-5D0B-4E8E-9A51-C0104E4C1E55}
AppName=Colored Lens Studio
AppVersion={#Version}
AppPublisher=DesignPraise Studio
AppPublisherURL=https://github.com/designpraiseeric/colored-lens-studio
DefaultDirName={commonpf64}\DesignPraise\Colored Lens Studio
DisableDirPage=yes
DisableProgramGroupPage=yes
PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir={#Root}\dist\release
OutputBaseFilename=ColoredLensStudio-{#Version}-win
Compression=lzma2
SolidCompression=yes
CloseApplications=yes

[Files]
; DaVinci Resolve Studio panel (Workflow Integration)
Source: "{#Root}\dist\resolve\com.designpraise.coloredlens\*"; DestDir: "{commonappdata}\Blackmagic Design\DaVinci Resolve\Support\Workflow Integration Plugins\com.designpraise.coloredlens"; Flags: recursesubdirs ignoreversion
; Lukuluku Look OpenFX (Resolve free and Studio)
Source: "{#Root}\engine\build\LukulukuLook.ofx.bundle\*"; DestDir: "{commoncf64}\OFX\Plugins\LukulukuLook.ofx.bundle"; Flags: recursesubdirs ignoreversion
; Lukuluku Look for Premiere Pro (only when the After Effects SDK was available at build time)
Source: "{#Root}\engine\build\Release\LukulukuLook.aex"; DestDir: "{commonpf64}\Adobe\Common\Plug-ins\7.0\MediaCore"; Flags: ignoreversion skipifsourcedoesntexist
; Premiere Pro panel, installed through Adobe's installer agent below
Source: "{#Root}\dist\release\ColoredLens-Premiere-{#Version}.ccx"; DestDir: "{app}"; Flags: ignoreversion

[Dirs]
Name: "{commonappdata}\Blackmagic Design\DaVinci Resolve\Support\LUT\ColoredLens"; Permissions: users-modify

[Run]
Filename: "{commoncf64}\Adobe\Adobe Desktop Common\RemoteComponents\UPI\UnifiedPluginInstallerAgent\UnifiedPluginInstallerAgent.exe"; Parameters: "/install ""{app}\ColoredLens-Premiere-{#Version}.ccx"""; Flags: runasoriginaluser waituntilterminated skipifdoesntexist; StatusMsg: "Installing the Premiere Pro panel..."
Filename: "{app}\ColoredLens-Premiere-{#Version}.ccx"; Flags: shellexec runasoriginaluser postinstall skipifsilent; Description: "Confirm the Premiere Pro panel in Creative Cloud"
