# Развёртывание

## Windows

Нужны PowerShell 7, PostgreSQL 18 и Node.js 24.22.3+ или 26.13.1+ в пределах соответствующей LTS-ветки. PostgreSQL слушает порт 55438, приложение — 5180. Пути к программам записываются в `.local/config/runtime.json`, настройки приложения — в `.local/config/application.env`.

На новом компьютере из корня:

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\manage.ps1 setup
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\manage.ps1 migrate
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\manage.ps1 seed
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\manage.ps1 start -WithoutAssistant
```

`setup` устанавливает зависимости из lock-файла и создаёт отдельный кластер, случайный пароль и локальные настройки. Если данные или настройки уже существуют, подготовка прекращается без их перезаписи. `seed` предназначен только для пустой базы локального показа. Для установки с реальными пользователями он не используется.

Если программы отсутствуют в `PATH`, укажите пути при подготовке. Для второй копии задайте свободные порты параметрами `-AppPort` и `-DatabasePort`.

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\manage.ps1 setup -NodePath 'C:\Runtime\node\node.exe' -PostgresBin 'C:\Runtime\postgres\bin'
```

`check`, `test` и `build` вызываются через корневой `scripts/manage.ps1`. Для запуска с помощником выполните `pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\manage.ps1 start`. Первый запуск скачает модель и локальный сервер llama.cpp.

## Docker

Все файлы находятся в `deploy/docker`. Контекст сборки остаётся корнем проекта; специфичный `Dockerfile.dockerignore` исключает `.local`, зависимости и сборки. Финальный образ содержит production-зависимости, `.output`, миграции, служебные сценарии БД и healthcheck. Пользователь контейнера `node`, файловая система только для чтения.

По умолчанию Compose использует Node.js 26.13.1. Чтобы собрать образ на Node.js 24, задайте `NODE_IMAGE=node:24.22.3-bookworm-slim` в `.local/config/compose.env`.

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\manage.ps1 docker-config
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\manage.ps1 docker-up
```

На Linux или без корневого PowerShell-скрипта:

```sh
node scripts/deployment/create-environment.mjs
docker compose --env-file .local/config/compose.env -f deploy/docker/compose.yaml config --quiet
docker compose --env-file .local/config/compose.env -f deploy/docker/compose.yaml up --build -d
```

При запуске через `scripts/manage.ps1` помощник включён по умолчанию. Отдельный сервис `model-init` скачивает GGUF из закреплённой ревизии и проверяет размер и SHA-256 до запуска модели. Файл остаётся в `.local/models` между перезапусками. Если он уже проверен, повторная загрузка не выполняется. Для ручного вызова Compose добавьте `--profile ai` перед `up`.

Compose запускает PostgreSQL 18.7, затем миграции и приложение. Порты БД и модели не публикуются. Доступен только `127.0.0.1:5180`. Приложение использует роль `deka_app`, миграции роль `deka_owner`. Пароли генерируются в `.local/config/compose.env` и не перезаписываются автоматически. Изменение файла не изменяет пароль уже созданной БД.

Пустую отдельную базу для презентации можно наполнить явно:

```sh
docker compose --env-file .local/config/compose.env -f deploy/docker/compose.yaml --profile sample-data run --rm seed
```

Быстрый вход в обычном запуске Compose отключён. Команда `pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\manage.ps1 docker-demo` явно включает локальный режим показа и наполняет только пустую базу. `APP_ORIGIN` задаётся при сборке; после изменения адреса образ нужно пересобрать. `docker compose ... down` сохраняет именованный том PostgreSQL и скачанную модель. Не используйте удаление томов для штатного обновления.

## Публичная установка для жюри

Подготовьте отдельный Linux-хост с Docker Compose и Caddy, домен и запись DNS на этот хост. Откройте 80 и 443 для Caddy. Порт приложения остаётся на loopback, PostgreSQL и модель доступны внутри Compose. Используйте новую установку и отдельный том PostgreSQL. [Настройка HTTPS в Caddy](https://caddyserver.com/docs/quick-starts/https)

Из корня проекта, подставив адрес своего домена:

~~~sh
node scripts/deployment/create-environment.mjs --contest-origin https://deka.example.ru
docker compose --project-name deka-contest --env-file .local/config/compose.env -f deploy/docker/compose.yaml up --build -d app
docker compose --project-name deka-contest --env-file .local/config/compose.env -f deploy/docker/compose.yaml --profile sample-data run --rm seed
~~~

Установите для Caddy конфигурацию из `deploy/docker/Caddyfile.contest` с тем же доменом. Caddy передаёт адрес клиента в `X-Forwarded-For`. Приложение использует последний адрес для ограничения попыток входа. Если TLS завершает другой прокси, настройте эквивалентную обработку заголовка и защищённый внутренний маршрут.

Через профиль `ai` можно поднять модель. Первая загрузка занимает время. Регламентный сценарий кабинета и ответы по поддерживаемым фактам работают без неё.

Скрипт создаёт учётные записи `student@deka.test`, `student2@deka.test` и `dean@deka.test`. Пароли создаются отдельно в `.local/config/compose.env` и передаются лишь одноразовому сервису наполнения. Для жюри используйте только три соответствующих значения `CONTEST_*_PASSWORD`. Сохраните доступ к файлу конфигурации у оператора и уберите одноразовый контейнер запуска. Повторное наполнение конкурсной базы отклоняется.

Перед подачей пройдите вход обоими студентами, подачу заявки в ширине 360 px и обработку от имени сотрудника. Убедитесь, что HTTPS-ссылка и исходники открываются с российской сети без VPN. Сохраняйте сервис и конкурсную БД до 28 ноября 2026 года.

Подайте ссылку, три аккаунта, исходный ZIP или публичный репозиторий и описание процесса в кабинете капитана. Ссылка на текущую ветку GitHub подходит после публикации именно этой ревизии. [Регламент](https://challenge.mgimo.ai/rules)

## GPU и переход на CPU

`scripts/manage.ps1` сначала поднимает приложение, подготавливает модель, проверяет доступ к GPU из контейнера и запускает помощника. Для NVIDIA выбирается `compose.cuda.yaml`, для Linux с `/dev/dri` используется `compose.vulkan.yaml`. Если запуск или проверка здоровья GPU-контейнера завершились ошибкой, он заменяется CPU-контейнером. Ошибка запуска CPU не скрывается. Выбранный режим записывается в `.local/run/docker-acceleration.json`.

На Windows для NVIDIA необходим Docker Desktop с WSL2 и рабочий драйвер. Наличие видеокарты в системе само по себе не подтверждает её доступность из контейнера. Обычный вызов `docker compose` использует CPU-конфигурацию; автоматический выбор и резервный запуск выполняет `scripts/manage.ps1`.

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\manage.ps1 docker-demo
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\manage.ps1 docker-demo -Acceleration cpu
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\manage.ps1 docker-demo -WithoutAssistant
```

## Резервные копии

```powershell
pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\manage.ps1 backup
```

Создаётся custom-дамп `.local/backups/deka-ДАТА-ВРЕМЯ.dump`. Пароль передаётся `pg_dump` через окружение дочернего процесса. Файл не перезаписывает предыдущие копии. Восстановление проверяйте через `pg_restore` в отдельную пустую БД, затем выполняйте функциональную проверку. Не восстанавливайте поверх работающей базы.

До пилота нужны согласованные периоды хранения и проверка восстановления, внешний мониторинг, HTTPS, ротация журналов и контроль доступа к каталогу `.local` и копиям.

## Проверка восстановления и архив

Нативная установка: `pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\manage.ps1 backup-check` создаёт копию и восстанавливает её в отдельную базу с проверкой контрольных записей. Для Docker: `pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\manage.ps1 docker-backup`; Node.js и pg_dump на хосте не нужны.

Архив исходников: `pwsh -NoProfile -ExecutionPolicy Bypass -File .\scripts\manage.ps1 package`. Файл появляется в `.local/releases`; локальное состояние не включается.

Образы llama.cpp CPU, CUDA и Vulkan закреплены SHA-256 digest, полученными из официального GHCR 17 ноября 2026. Переопределения LLAMA_IMAGE, LLAMA_CUDA_IMAGE и LLAMA_VULKAN_IMAGE сохраняются. Замена digest требует повторной проверки на целевой машине.

## Витрина на GitHub Pages

В `site/` лежат HTML, CSS, JavaScript и материалы для показа. Для просмотра из корня проекта:

```sh
python -m http.server 4173 --bind 127.0.0.1 --directory site
```

Откройте [127.0.0.1:4173](http://127.0.0.1:4173/). Сценарии в витрине работают с вымышленными примерами в браузере.

В репозитории включите **Settings → Pages → Build and deployment → GitHub Actions**. Workflow [Publish project site](../.github/workflows/pages.yml) публикует `site/` из `main`. Адрес появится в результате задачи `publish`. При наличии отдельного HTTPS-развёртывания задайте `LIVE_PORTAL_URL` в переменных репозитория и перезапустите workflow. Тогда на витрине появится ссылка **«Войти в кабинет»**.

Витрина показывает сценарии и материалы. Для учётных записей, записи данных и проверки доступа используйте [публичную установку кабинета](#публичная-установка-для-жюри).
