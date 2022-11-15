
# Run the query but only return public properties
Get-WmiObject -Query "SELECT Name, ThreadCount, WorkingSet FROM Win32_PerfRawData_PerfProc_Process" |
Select-Object -Property * -ExcludeProperty @("Scope", "Path", "Options", "Properties", "SystemProperties", "ClassPath", "Qualifiers", "Site", "Container", "PSComputerName", "__GENUS", "__CLASS", "__SUPERCLASS", "__DYNASTY", "__RELPATH", "__PROPERTY_COUNT", "__DERIVATION", "__SERVER", "__NAMESPACE", "__PATH") | 
ConvertTo-Json -Depth 1