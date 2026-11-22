$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$projectPath=[IO.Path]::GetFullPath((Split-Path (Split-Path $PSScriptRoot)))
$outputDirectory=Join-Path $projectPath '.local/releases'
[IO.Directory]::CreateDirectory($outputDirectory)|Out-Null
$filename='deka-source-'+(Get-Date -Format 'yyyyMMdd-HHmmss')+'.zip'
$target=Join-Path $outputDirectory $filename
$temporary=Join-Path $outputDirectory ([guid]::NewGuid().ToString('N')+'.partial')
if(![IO.Path]::GetFullPath($temporary).StartsWith([IO.Path]::GetFullPath($outputDirectory)+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Unexpected archive target.'}
$files=@()
foreach($directory in @('src','static','tests','scripts','db','deploy','docs','site','.github')){
  $path=Join-Path $projectPath $directory
  if(!(Test-Path -LiteralPath $path -PathType Container)){throw ('Missing source directory: '+$directory)}
  $files+=Get-ChildItem -LiteralPath $path -Recurse -File -Force
}
foreach($relative in @('README.md','LICENSE','.gitignore','.gitattributes','package.json','package-lock.json','tsconfig.json','vite.config.ts')){
  $files+=Get-Item -LiteralPath (Join-Path $projectPath $relative) -Force
}
$agentNotes = Join-Path $projectPath 'AGENTS.md'
if (Test-Path -LiteralPath $agentNotes -PathType Leaf) { $files += Get-Item -LiteralPath $agentNotes }
$manifest=@()
$archive=$null
try {
  $stream=[IO.File]::Open($temporary,[IO.FileMode]::CreateNew)
  $archive=[IO.Compression.ZipArchive]::new($stream,[IO.Compression.ZipArchiveMode]::Create,$false)
  foreach($file in ($files|Sort-Object FullName -Unique)){
    $relative=[IO.Path]::GetRelativePath($projectPath,$file.FullName).Replace('\','/')
    if($relative -match '[^\x20-\x7e]' -or $relative -match '(^|/)(?:\.env(?:\..*)?|var|\.local|node_modules|\.git|\.output|\.svelte-kit|\.test-build)(/|$)' -or $relative.StartsWith('../')){throw ('Unexpected source entry: '+$relative)}
    if ($file.Attributes.HasFlag([IO.FileAttributes]::ReparsePoint) -or $relative -match '\.(env|gguf|dump|pem|key)$') {
      throw ('Local or linked file in source archive: ' + $relative)
    }
    [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,$file.FullName,('deka/'+$relative),[IO.Compression.CompressionLevel]::Optimal)|Out-Null
    $manifest+=@{path=$relative;sha256=(Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}
  }
  $entry=$archive.CreateEntry('deka/release-manifest.json')
  $writer=[IO.StreamWriter]::new($entry.Open(),[Text.UTF8Encoding]::new($false))
  try{$writer.Write((@{created=[datetime]::UtcNow.ToString('O');files=$manifest}|ConvertTo-Json -Depth 5))}finally{$writer.Dispose()}
  $archive.Dispose();$archive=$null
  Move-Item -LiteralPath $temporary -Destination $target
  Write-Host ('Source archive: '+$target)
  Write-Host ('SHA-256: '+(Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant())
}finally{
  if($archive){$archive.Dispose()}
  if(Test-Path -LiteralPath $temporary){Remove-Item -LiteralPath $temporary -Force}
}
