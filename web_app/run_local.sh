#!/bin/bash

# ==============================================================================
# Script Khởi Chạy Local (Không Cần Docker, Dùng SQLite + Python)
# Dành cho việc test nhanh trên máy tính cá nhân
# ==============================================================================

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR/backend"

echo "=========================================================="
echo "KHOI CHAY HE THONG WEB & API LOCAL (KHONG CAN DOCKER)"
echo "=========================================================="

# 1. Kiểm tra môi trường Python
if ! command -v python3 &> /dev/null; then
    echo "[!] Loi: Chua cai dat Python3!"
    exit 1
fi

# 2. Tạo hoặc kích hoạt Virtual Environment (nếu có)
if [ ! -d "venv" ]; then
    echo "[*] Dang tao moi truong ao Python venv..."
    python3 -m venv venv || true
fi

if [ -f "venv/bin/activate" ]; then
    source venv/bin/activate
fi

# 3. Cài đặt các thư viện cần thiết
echo "[*] Dang kiem tra thu vien..."
pip install --upgrade pip > /dev/null 2>&1 || true
pip install -r requirements.txt

# 4. Thiết lập biến môi trường chạy local (Dùng SQLite tự sinh file, không cần Postgres)
if [ -f "$DIR/.env" ]; then
    set -a
    source "$DIR/.env"
    set +a
fi

export DATABASE_URL="${DATABASE_URL:-sqlite:///./gate_datn.db}"
export PORT="${PORT:-8001}"
export JWT_SECRET="${JWT_SECRET:-gate_datn_super_secret_jwt_key_ictu_2026}"
export MQTT_BROKER_URI="${MQTT_BROKER_URI:-mqtts://your-cluster.s1.eu.hivemq.cloud:8883}"
export MQTT_USERNAME="${MQTT_USERNAME:-your_mqtt_username}"
export MQTT_PASSWORD="${MQTT_PASSWORD:-your_mqtt_password}"
export DEFAULT_ADMIN_USER="${DEFAULT_ADMIN_USER:-admin}"
export DEFAULT_ADMIN_PASS="${DEFAULT_ADMIN_PASS:-admin123}"

echo ""
echo "=========================================================="
echo "[+] HE THONG DA SAN SANG! DANG CHAY TAI CAC LIEN KET SAU:"
echo "=========================================================="
echo "Trang Dang Nhap       : http://localhost:8001/login.html"
echo "Bang Dieu Khien       : http://localhost:8001/index.html"
echo "Tai Lieu API (Swagger): http://localhost:8001/docs"
echo "Tai Lieu API (ReDoc)  : http://localhost:8001/redoc"
echo "----------------------------------------------------------"
echo "Tai khoan dang nhap   : admin / admin123"
echo "Bam Ctrl + C de dung."
echo "=========================================================="
echo ""

uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
