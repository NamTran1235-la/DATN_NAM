import json
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.database import get_session
from app.auth import get_current_user
from app.models import User, UserDeviceConfig, UserDeviceConfigRequest, get_utc_now

logger = logging.getLogger("USER_ROUTER")

router = APIRouter(prefix="/user", tags=["1. Quản lý Tài khoản & Cấu hình Người dùng"])

def resolve_user_id(current_user: dict, session: Session) -> int:
    uid = current_user.get("user_id")
    if uid:
        return int(uid)
    uname = current_user.get("username")
    if uname:
        u = session.exec(select(User).where(User.username == uname)).first()
        if u and u.id:
            return u.id
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Không thể xác định danh tính người dùng"
    )

@router.get(
    "/devices",
    summary="Lấy cấu hình danh sách thiết bị Dashboard của người dùng",
    description="Truy xuất danh sách thiết bị và cờ trạng thái xóa đã đồng bộ trên máy chủ."
)
def get_user_devices(
    current_user: dict = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    uid = resolve_user_id(current_user, session)
    cfg = session.exec(select(UserDeviceConfig).where(UserDeviceConfig.user_id == uid)).first()
    if not cfg:
        return {
            "success": True,
            "data": {
                "has_config": False,
                "devices": [],
                "deleted_flags": {},
                "rooms": [],
                "scenes": [],
                "automations": [],
                "settings": {}
            }
        }
    
    try:
        devices = json.loads(cfg.devices_json or "[]")
    except Exception:
        devices = []
        
    try:
        deleted_flags = json.loads(cfg.deleted_flags_json or "{}")
    except Exception:
        deleted_flags = {}

    try:
        rooms = json.loads(cfg.rooms_json or "[]")
    except Exception:
        rooms = []

    try:
        scenes = json.loads(cfg.scenes_json or "[]")
    except Exception:
        scenes = []

    try:
        automations = json.loads(cfg.automations_json or "[]")
    except Exception:
        automations = []

    try:
        settings = json.loads(cfg.settings_json or "{}")
    except Exception:
        settings = {}

    return {
        "success": True,
        "data": {
            "has_config": True,
            "devices": devices,
            "deleted_flags": deleted_flags,
            "rooms": rooms,
            "scenes": scenes,
            "automations": automations,
            "settings": settings,
            "updated_at": cfg.updated_at.isoformat() if cfg.updated_at else None
        }
    }

@router.post(
    "/devices",
    summary="Lưu & đồng bộ cấu hình Dashboard lên máy chủ",
    description="Lưu danh sách thiết bị, phòng, ngữ cảnh, kịch bản theo tài khoản để đồng bộ toàn diện giữa Điện thoại và Laptop."
)
def save_user_devices(
    req: UserDeviceConfigRequest,
    current_user: dict = Depends(get_current_user),
    session: Session = Depends(get_session)
):
    uid = resolve_user_id(current_user, session)
    cfg = session.exec(select(UserDeviceConfig).where(UserDeviceConfig.user_id == uid)).first()
    
    now_utc = get_utc_now()

    if not cfg:
        cfg = UserDeviceConfig(
            user_id=uid,
            devices_json=json.dumps(req.devices if req.devices is not None else [], ensure_ascii=False),
            deleted_flags_json=json.dumps(req.deleted_flags if req.deleted_flags is not None else {}, ensure_ascii=False),
            rooms_json=json.dumps(req.rooms if req.rooms is not None else [], ensure_ascii=False),
            scenes_json=json.dumps(req.scenes if req.scenes is not None else [], ensure_ascii=False),
            automations_json=json.dumps(req.automations if req.automations is not None else [], ensure_ascii=False),
            settings_json=json.dumps(req.settings if req.settings is not None else {}, ensure_ascii=False),
            updated_at=now_utc
        )
        session.add(cfg)
    else:
        if req.devices is not None:
            cfg.devices_json = json.dumps(req.devices, ensure_ascii=False)
        if req.deleted_flags is not None:
            cfg.deleted_flags_json = json.dumps(req.deleted_flags, ensure_ascii=False)
        if req.rooms is not None:
            cfg.rooms_json = json.dumps(req.rooms, ensure_ascii=False)
        if req.scenes is not None:
            cfg.scenes_json = json.dumps(req.scenes, ensure_ascii=False)
        if req.automations is not None:
            cfg.automations_json = json.dumps(req.automations, ensure_ascii=False)
        if req.settings is not None:
            cfg.settings_json = json.dumps(req.settings, ensure_ascii=False)
        cfg.updated_at = now_utc
        session.add(cfg)

    session.commit()
    session.refresh(cfg)
    
    dev_count = len(req.devices) if req.devices is not None else 0
    logger.info(f"Đã đồng bộ cấu hình cho tài khoản user_id={uid}")
    return {
        "success": True,
        "message": "Đã lưu cấu hình Dashboard thành công",
        "data": {
            "device_count": dev_count,
            "updated_at": cfg.updated_at.isoformat()
        }
    }
