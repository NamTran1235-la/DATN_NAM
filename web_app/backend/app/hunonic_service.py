import logging
from app.mqtt_service import latest_gateway_status

logger = logging.getLogger("HUNONIC_SERVICE")

# Bảng tập lệnh tiêu chuẩn từ Hunonic Cloud cho từng dòng điều hòa
HUNONIC_BRAND_PROFILES = {
    104: {
        "brand_name": "Funiki",
        "temp_min": 17,
        "temp_max": 30,
        "modes": [
            {"code": 1, "name": "cool", "label": "Làm mát", "icon": "fa-snowflake"},
            {"code": 2, "name": "heat", "label": "Sưởi ấm", "icon": "fa-fire"},
            {"code": 3, "name": "dry", "label": "Hút ẩm", "icon": "fa-droplet"},
            {"code": 4, "name": "fan", "label": "Quạt gió", "icon": "fa-fan"},
            {"code": 0, "name": "auto", "label": "Tự động", "icon": "fa-arrows-rotate"},
        ],
        "fans": [
            {"code": 0, "name": "auto", "label": "Tự động", "icon": "fa-a"},
            {"code": 1, "name": "min", "label": "Nhỏ"},
            {"code": 3, "name": "med", "label": "Vừa"},
            {"code": 5, "name": "max", "label": "Lớn"},
        ]
    },
    102: {
        "brand_name": "Casper",
        "temp_min": 16,
        "temp_max": 30,
        "modes": [
            {"code": 4, "name": "cool", "label": "Làm mát", "icon": "fa-snowflake"},
            {"code": 12, "name": "dry", "label": "Hút ẩm", "icon": "fa-droplet"},
            {"code": 2, "name": "fan", "label": "Quạt gió", "icon": "fa-fan"},
            {"code": 0, "name": "sun", "label": "Sưởi ấm", "icon": "fa-fire"},
        ],
        "fans": [
            {"code": 6, "name": "auto", "label": "Tự động", "icon": "fa-a"},
            {"code": 1, "name": "min", "label": "Nhỏ"},
            {"code": 5, "name": "max", "label": "Lớn"},
        ]
    },
    16: {
        "brand_name": "Casper - Electra",
        "temp_min": 16,
        "temp_max": 30,
        "modes": [
            {"code": 0, "name": "auto", "label": "Tự động", "icon": "fa-arrows-rotate"},
            {"code": 1, "name": "cool", "label": "Làm mát", "icon": "fa-snowflake"},
            {"code": 2, "name": "dry", "label": "Hút ẩm", "icon": "fa-droplet"},
            {"code": 4, "name": "heat", "label": "Sưởi ấm", "icon": "fa-fire"},
            {"code": 6, "name": "fan", "label": "Quạt gió", "icon": "fa-fan"},
        ],
        "fans": [
            {"code": 5, "name": "auto", "label": "Tự động", "icon": "fa-a"},
            {"code": 3, "name": "min", "label": "Nhỏ"},
            {"code": 2, "name": "med", "label": "Vừa"},
            {"code": 1, "name": "max", "label": "Lớn"},
        ]
    },
    117: {
        "brand_name": "Mirage",
        "temp_min": 16,
        "temp_max": 32,
        "modes": [
            {"code": 2, "name": "cool", "label": "Làm mát", "icon": "fa-snowflake"},
            {"code": 3, "name": "dry", "label": "Hút ẩm", "icon": "fa-droplet"},
            {"code": 5, "name": "fan", "label": "Quạt gió", "icon": "fa-fan"},
            {"code": 1, "name": "heat", "label": "Sưởi ấm", "icon": "fa-fire"},
        ],
        "fans": [
            {"code": 0, "name": "auto", "label": "Tự động", "icon": "fa-a"},
            {"code": 3, "name": "min", "label": "Nhỏ"},
            {"code": 2, "name": "med", "label": "Vừa"},
            {"code": 1, "name": "max", "label": "Lớn"},
        ]
    }
}

def get_brand_profile(brand_id: int, name: str = "") -> dict:
    if brand_id in HUNONIC_BRAND_PROFILES:
        return HUNONIC_BRAND_PROFILES[brand_id]
    n = (name or "").lower()
    if "electra" in n:
        return HUNONIC_BRAND_PROFILES[16]
    if "casper" in n:
        return HUNONIC_BRAND_PROFILES[102]
    if "mirage" in n:
        return HUNONIC_BRAND_PROFILES[117]
    return HUNONIC_BRAND_PROFILES[104]

class HunonicService:
    def __init__(self):
        """
        Khởi tạo HunonicService.
        Theo kiến trúc dự án: Web Backend KHÔNG gọi trực tiếp tới Hunonic Cloud.
        Trạm Gateway ESP32-S3 đảm nhiệm việc định kỳ kiểm tra trạng thái IR Hub thực tế
        từ Hunonic Cloud và gửi trường 'ir_online' lên MQTT Broker.
        """
        pass

    def get_status(self) -> dict:
        """
        Kiểm tra trạng thái thời gian thực của thiết bị Hunonic IR và Điều hòa.
        Được lấy trực tiếp từ bản tin Heartbeat của Gateway ESP32-S3 (trường ir_online).
        """
        gw_online = latest_gateway_status.get("online", False)
        ir_online = gw_online and bool(latest_gateway_status.get("ir_online", 0))

        if not gw_online:
            reason = "Trạm Gateway ESP32-S3 đang ngoại tuyến (Offline)"
        elif not ir_online:
            reason = "Trạm phát hồng ngoại IR Hub chưa cắm nguồn (Ngoại tuyến)"
        else:
            reason = "Trực tuyến (Online)"

        hub_state = "1" if ir_online else "2"

        ac_count = latest_gateway_status.get("ac_count")
        ac_id = str(latest_gateway_status.get("ac_id") or "")
        ac_name = str(latest_gateway_status.get("ac_name") or "")

        # Lấy danh sách toàn bộ các thiết bị con từ RAM cache
        ac_devices_dict = latest_gateway_status.get("ac_devices", {})
        children = []

        if ac_devices_dict:
            for did, dinfo in ac_devices_dict.items():
                p = dinfo.get("power", 0) if ir_online else 0
                t = dinfo.get("temp", 25)
                m = dinfo.get("mode", 1)
                f = dinfo.get("fan", 0)
                b = dinfo.get("brand", 0)
                dname = dinfo.get("name") or f"Điều hòa {did}"
                profile = get_brand_profile(b, dname)
                effective_brand = b or (16 if "electra" in dname.lower() else (102 if "casper" in dname.lower() else (117 if "mirage" in dname.lower() else 104)))
                children.append({
                    "id": str(did),
                    "name": dname,
                    "type": "ac",
                    "category": "AC",
                    "brand": effective_brand,
                    "brand_name": profile["brand_name"],
                    "power": p,
                    "temp": t,
                    "mode": m,
                    "fan": f,
                    "temp_min": profile["temp_min"],
                    "temp_max": profile["temp_max"],
                    "modes": profile["modes"],
                    "fans": profile["fans"],
                    "online": ir_online,
                    "offline_reason": reason,
                    "details": f"ID: {did} • {profile['brand_name']} • {t}°C"
                })
        elif ac_count != 0 and ac_id:
            ac_power = latest_gateway_status.get("ac_power", 0) if ir_online else 0
            ac_temp = latest_gateway_status.get("ac_temp", 25)
            ac_mode = latest_gateway_status.get("ac_mode", 1)
            ac_fan = latest_gateway_status.get("ac_fan", 0)
            ac_brand = latest_gateway_status.get("ac_brand", 0)
            dname = ac_name if ac_name else f"Điều hòa {ac_id}"
            profile = get_brand_profile(ac_brand, dname)
            effective_brand = ac_brand or (16 if "electra" in dname.lower() else (102 if "casper" in dname.lower() else (117 if "mirage" in dname.lower() else 104)))

            children.append({
                "id": ac_id,
                "name": dname,
                "type": "ac",
                "category": "AC",
                "brand": effective_brand,
                "brand_name": profile["brand_name"],
                "power": ac_power,
                "temp": ac_temp,
                "mode": ac_mode,
                "fan": ac_fan,
                "temp_min": profile["temp_min"],
                "temp_max": profile["temp_max"],
                "modes": profile["modes"],
                "fans": profile["fans"],
                "online": ir_online,
                "offline_reason": reason,
                "details": f"ID: {ac_id} • {profile['brand_name']} • {ac_temp}°C"
            })
        else:
            # Không có thiết bị điều hòa con nào trong trạm IR
            children = []

        return {
            "success": True,
            "is_online": ir_online,
            "hub_name": "IR trung tâm",
            "hub_id": "3987670",
            "hub_state": hub_state,
            "hub_last_online": latest_gateway_status.get("last_seen"),
            "children": children,
            "children_count": len(children),
            "ac_id": ac_id,
            "ac_name": ac_name,
            "ac_power": latest_gateway_status.get("ac_power", 0) if ir_online else 0,
            "ac_temp": latest_gateway_status.get("ac_temp", 25),
            "reason": reason
        }

hunonic_service = HunonicService()
