$script = Join-Path $PSScriptRoot "remind.py"
$action = New-ScheduledTaskAction -Execute "python" -Argument "`"$script`""
$trigger = New-ScheduledTaskTrigger -Daily -At "09:00"
Register-ScheduledTask -TaskName "VehicleStickerReminder" -Action $action -Trigger $trigger -Description "Plate and city sticker renewal reminder"
