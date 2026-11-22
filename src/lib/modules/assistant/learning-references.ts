const bindings = {
  id: 'reference-js-bindings',
  title: 'MDN: const',
  href: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/const',
  text: 'let допускает повторное присваивание. const фиксирует привязку переменной. Если переменная содержит объект, его свойства можно менять. Обе декларации имеют блочную область видимости.'
};
const references = [
  {
    id: 'reference-sql-joins',
    title: 'PostgreSQL: соединения таблиц',
    href: 'https://www.postgresql.org/docs/18/queries-table-expressions.html#QUERIES-JOIN',
    matches: (q: string) => /\bjoin\b/iu.test(q),
    text: 'INNER JOIN возвращает строки с совпадением условия в обеих таблицах. A LEFT JOIN B сохраняет ВСЕ строки ЛЕВОЙ таблицы A. Если соответствия справа нет, столбцы B равны NULL. Пример: students s LEFT JOIN grades g ON g.student_id=s.id возвращает всех студентов, в том числе без оценок. RIGHT JOIN сохраняет правую таблицу. Не путай левую и правую стороны.'
  },
  { ...bindings, matches: (q: string) => /\bconst\b|\blet\b/iu.test(q) }
];
export function learningReferences(question: string) {
  return references
    .filter((reference) => reference.matches(question))
    .map(({ id, title, href, text }) => ({ id, title, href, text }));
}

export function learningFact(question: string) {
  const text = question.trim().replaceAll('\x60', '').replace(/\s+/g, ' ');
  const comparison =
    /^(?:чем (const|let) отличается от (const|let)|(?:объясни )?(?:в ч[её]м )?разниц[ау] между (const|let) и (const|let))(?: в (?:javascript|js))?[?.!]*$/iu.exec(
      text
    );
  if (!comparison) return null;
  const left = comparison[1] ?? comparison[3];
  const right = comparison[2] ?? comparison[4];
  if (left.toLowerCase() === right.toLowerCase()) return null;
  const { id, title, href, text: answer } = bindings;
  return { text: answer, sources: [{ id, title, href }] };
}
