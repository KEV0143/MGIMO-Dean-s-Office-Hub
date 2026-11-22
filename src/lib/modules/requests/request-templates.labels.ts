import type { RequestKind } from './request.types.ts';

interface RequestTemplate {
  kind: RequestKind;
  label: string;
  description: string;
  text: string;
  hint: string;
}

export const requestTemplates = {
  study: {
    kind: 'study',
    label: 'Об обучении',
    description: 'Подтвердить, что вы учитесь в вузе.',
    text: 'Справка для предоставления по месту требования. Нужен один экземпляр.',
    hint: 'Если справку ждёт конкретная организация, укажите её название.'
  },
  scholarship: {
    kind: 'scholarship',
    label: 'О стипендии',
    description: 'Запросить сведения о назначенной стипендии.',
    text: 'Справка о назначенной стипендии для предоставления по месту требования.',
    hint: 'Добавьте период, за который нужны сведения.'
  },
  tax: {
    kind: 'tax',
    label: 'Для налоговой',
    description: 'Запросить справку для налогового органа.',
    text: 'Справка об оплате обучения для предоставления в налоговый орган.',
    hint: 'Укажите год оплаты и количество экземпляров.'
  }
} satisfies Record<string, RequestTemplate>;

export const isRequestTemplate = (value: string): value is keyof typeof requestTemplates =>
  Object.hasOwn(requestTemplates, value);

export function suggestRequestTemplate(question: string) {
  const text = question.toLowerCase().replace(/ё/g, 'е');
  const intent =
    /^(?:помоги (?:оформить|заказать|подать)|оформи|закажи|мне нужна|хочу получить)(?:\s|$)/u;
  if (!intent.test(text) || !/справк/u.test(text)) return null;

  const matches = [
    { id: 'study', pattern: /об обучени|с места учеб|что я учусь/u },
    { id: 'scholarship', pattern: /стипенди/u },
    { id: 'tax', pattern: /налогов|вычет/u }
  ] as const;
  const candidates = matches.filter(({ pattern }) => pattern.test(text));
  const selected = candidates.length === 1 ? candidates[0].id : null;
  return { selected, template: selected === null ? null : requestTemplates[selected] };
}
