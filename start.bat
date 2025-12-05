@echo off
echo 🚀 Iniciando ambiente Docker...
echo.

echo 📦 Parando containers existentes...
docker compose down

echo 🔨 Construindo imagens...
docker compose build --no-cache

echo 🚀 Subindo servicos...
docker compose up -d

echo ⏳ Aguardando servicos ficarem prontos...
timeout /t 10

echo 📊 Status dos containers:
docker compose ps

echo.
echo ✅ Ambiente iniciado!
echo 🌐 Acesse: http://localhost
echo 📋 Para ver logs: docker compose logs -f
echo 🛑 Para parar: docker compose down