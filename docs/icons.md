# Иконки

В кабинете используются 36 SVG-иконок Lucide. Они импортируются по именам файлов пакета `@lucide/svelte`. У иконки рядом с текстом стоит `aria-hidden`, у кнопки без текста задано доступное имя. Витрина использует знак проекта и текстовые ссылки.

## Распространённость

Загрузки npm с 15 по 21 ноября 2026 года. React-пакеты сравниваются в одной экосистеме. Загрузки могут включать CI и повторные установки.

| Набор | Загрузки React-пакета | Вариант для Svelte 5 |
| --- | ---: | --- |
| [Lucide](https://lucide.dev/guide/packages/lucide-svelte) | [144 192 163](https://api.npmjs.org/downloads/point/2026-11-15:2026-11-21/lucide-react) | [`@lucide/svelte` · 1 587 111 загрузок](https://api.npmjs.org/downloads/point/2026-11-15:2026-11-21/@lucide/svelte) |
| [Phosphor](https://phosphoricons.com/) | [8 305 561](https://api.npmjs.org/downloads/point/2026-11-15:2026-11-21/@phosphor-icons/react) | SVG и сторонние пакеты |
| [Heroicons](https://github.com/tailwindlabs/heroicons) | [6 775 992](https://api.npmjs.org/downloads/point/2026-11-15:2026-11-21/@heroicons/react) | SVG, официальные пакеты для React и Vue |
| [Tabler](https://tabler.io/icons) | [5 536 728](https://api.npmjs.org/downloads/point/2026-11-15:2026-11-21/@tabler/icons-react) | [`@tabler/icons-svelte` · 37 150 загрузок](https://api.npmjs.org/downloads/point/2026-11-15:2026-11-21/@tabler/icons-svelte) |

## Замер в Деке

Одна версия проекта, Windows, Ryzen 9 9950X3D, Node.js 26.13.1, Vite 8.3.6. По три чистых запуска сборки с чередованием способа импорта. Иконки и интерфейс одинаковые в обоих вариантах.

| Импорт | Модули SSR | Модули браузерной сборки | Время сборки, медиана | Сумма gzip для клиентского JS |
| --- | ---: | ---: | ---: | ---: |
| Из общего индекса | 4 769 | 4 725 | 7,23 с | 133 355 Б |
| По файлам | 487 | 443 | 3,32 с | 133 380 Б |

Прямые импорты сократили работу сборщика. Размер отправляемого клиенту JavaScript отличается на 25 байт. [Сырые замеры](benchmarks/icon-build-2026-11-22.json)