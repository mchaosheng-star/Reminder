import json
import subprocess
import sys
from datetime import date, datetime
from pathlib import Path

CONFIG_PATH = Path(__file__).parent / "config.json"


def load_config():
    with open(CONFIG_PATH, encoding="utf-8") as f:
        return json.load(f)


def days_until(renewal_str):
    renewal = datetime.strptime(renewal_str, "%Y-%m-%d").date()
    return (renewal - date.today()).days


def notify(title, message):
    safe_title = title.replace("'", "''")
    safe_message = message.replace("'", "''")
    ps = f"""
[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
$xml = New-Object Windows.Data.Xml.Dom.XmlDocument
$xml.LoadXml(@"
<toast>
  <visual>
    <binding template="ToastText02">
      <text id="1">{safe_title}</text>
      <text id="2">{safe_message}</text>
    </binding>
  </visual>
</toast>
"@)
$toast = [Windows.UI.Notifications.ToastNotification]::new($xml)
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("StickerReminder").Show($toast)
"""
    subprocess.run(
        ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps],
        check=False,
        capture_output=True,
    )


def main():
    config = load_config()
    remind_days = set(config.get("remind_days_before", [30, 14, 7, 1, 0]))
    alerts = []

    for key in ("plate_sticker", "city_sticker"):
        item = config[key]
        days = days_until(item["renewal_date"])
        if days in remind_days:
            if days == 0:
                msg = f"{item['name']} expires today."
            elif days == 1:
                msg = f"{item['name']} expires tomorrow."
            else:
                msg = f"{item['name']} expires in {days} days ({item['renewal_date']})."
            alerts.append((item["name"], msg))

    if not alerts:
        return 0

    for title, msg in alerts:
        print(f"{title}: {msg}")
        notify(title, msg)

    return 0


if __name__ == "__main__":
    sys.exit(main())
