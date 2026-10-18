# Bước 1 dựng danh mục VNACCS: xuất mọi sheet của các file Excel danh mục (.xls/.xlsx) ra CSV UTF-8 bằng Excel (mở chỉ đọc, không sửa file gốc).
# Cần Excel trên Windows (đọc được .xls đời cũ mà thư viện Node không đọc). Bước 2: node scripts/code-lists/build.mjs --csv <Out>.
#   powershell -File scripts/code-lists/export-csv.ps1 -Source ..\02_DANHMUC_VNACCS -Out $env:TEMP\kb-danhmuc-csv
param(
  [string]$Source = (Join-Path $PSScriptRoot "..\..\..\02_DANHMUC_VNACCS"),
  [string]$Out = (Join-Path $env:TEMP "kb-danhmuc-csv")
)
$ErrorActionPreference = "Stop"
$Source = (Resolve-Path $Source).Path
New-Item -ItemType Directory -Force $Out | Out-Null
Get-ChildItem $Out -Filter *.csv | Remove-Item -Confirm:$false
$excel = New-Object -ComObject Excel.Application
$excel.DisplayAlerts = $false; $excel.Visible = $false; $excel.AutomationSecurity = 3  # tắt macro
try {
  foreach ($f in Get-ChildItem $Source -File | Where-Object { $_.Extension -in ".xls", ".xlsx" -and -not $_.Name.StartsWith("~$") }) {
    $wb = $excel.Workbooks.Open($f.FullName, 0, $true)
    $i = 0
    foreach ($ws in @($wb.Worksheets)) {
      $i++
      if ($excel.WorksheetFunction.CountA($ws.UsedRange) -eq 0) { continue }
      $tmp = $excel.Workbooks.Add(); $ws.Copy($tmp.Worksheets.Item(1))
      $name = "{0}__{1}_{2}.csv" -f $f.BaseName, $i, ($ws.Name -replace '[^\w\-]', '_')
      $tmp.Worksheets.Item(1).SaveAs((Join-Path $Out $name), 62)  # 62 = CSV UTF-8
      $tmp.Close($false)
    }
    $wb.Close($false)
    Write-Host "  $($f.Name)"
  }
} finally {
  $excel.Quit(); [void][Runtime.InteropServices.Marshal]::ReleaseComObject($excel)
}
Write-Host "CSV: $Out"
