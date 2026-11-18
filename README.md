# Fardo Consulting CRM — прототип (Windows, офлайн)

Данные хранятся локально (файл fardo-demo.json в папке пользователя). Интернет и сервер не нужны. Только русский язык.

## Сборка .exe на Windows
1. Установите Node.js LTS (https://nodejs.org).
2. В папке проекта: `npm install`, затем `npm run dist`.
3. В папке `dist/` появятся установщик `Fardo CRM Setup 0.1.0.exe` и портативный `Fardo CRM 0.1.0.exe`.

Запуск без сборки: `npm start`. Без своего ПК: загрузите папку в GitHub и запустите workflow «Build Windows exe» (вкладка Actions).
