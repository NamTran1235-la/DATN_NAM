#!/bin/bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo "=========================================================="
echo "[1] KIEM TRA MOI TRUONG DOCKER..."
echo "=========================================================="
if ! command -v docker &> /dev/null; then
    echo "[!] Loi: May chu chua cai dat Docker!"
    exit 1
fi

echo "=========================================================="
echo "[2] BIEN DICH CAC CONTAINER (BACKEND + FRONTEND)..."
echo "=========================================================="
docker compose build

echo "=========================================================="
echo "[3] KHOI CHAY HE THONG TREN CAC CONG MOI..."
echo "=========================================================="
docker compose up -d

echo ""
echo "=========================================================="
echo "[+] TRIEN KHAI HOAN TAT THANH CONG!"
echo "=========================================================="
echo "Giao dien Web Dang Nhap : http://localhost:8080"
echo "Bang Dieu Khien Dashboard: http://localhost:8080/index.html"
echo "Tai Lieu API Swagger UI : http://localhost:8080/docs"
echo "Tai Lieu API ReDoc      : http://localhost:8080/redoc"
echo "Cong Backend API Truc tiep: http://localhost:8001/api/"
echo "Cong PostgreSQL Rieng   : localhost:5433"
echo "----------------------------------------------------------"
echo "Tai khoan dang nhap mac dinh: admin / admin123"
echo "=========================================================="
echo ""
echo "Đang theo dõi log của Backend API (Bấm Ctrl+C để thoát log):"
docker compose logs -f --tail=30 backend_api
