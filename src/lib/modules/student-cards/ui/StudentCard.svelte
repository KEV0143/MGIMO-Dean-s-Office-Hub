<script lang="ts">
  import Brand from '#shared/ui/Brand.svelte';
  import type { CardPresentation } from '../student-card.types.ts';
  let { presentation }: { presentation: CardPresentation } = $props();
</script>

<article class="student-card" aria-label="Электронный студенческий билет">
  <div class="card-top"><Brand /><span>Студенческий билет</span></div>
  <div class="card-body">
    <div class="details">
      <span class="number">{presentation.number}</span>
      <h2>{presentation.card.full_name}</h2>
      <p>{presentation.card.faculty_name}</p>
      <div class="course">
        <strong>{presentation.card.group_name}</strong><span>{presentation.card.course} курс</span>
      </div>
    </div>
    <img src={presentation.qr} alt="QR-код для проверки студенческого" width="130" height="130" />
  </div>
  <footer>
    <span>{presentation.card.program}</span><span class="active">Действует</span>
  </footer>
</article>

<style>
  .student-card {
    width: 100%;
    padding: clamp(20px, 3.3vw, 36px);
    border: 1px solid var(--border);
    border-radius: 22px;
    background: linear-gradient(135deg, #f8f9fc, #fff 65%);
    position: relative;
    overflow: hidden;
  }
  .card-top {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 15px;
    color: #655d78;
    font-size: 11px;
  }
  .card-top :global(.brand-lockup) {
    font-size: 25px;
  }
  .card-body {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
    margin: 30px 0 24px;
  }
  .number {
    font-size: 11px;
    color: #6a627c;
    letter-spacing: 0.1em;
  }
  h2 {
    font-size: 22px;
    line-height: 1.4;
    margin: 9px 0 10px;
    max-width: 560px;
    overflow-wrap: anywhere;
  }
  p {
    font-size: 12px;
    color: #686578;
    line-height: 1.65;
  }
  .details {
    min-width: 0;
  }
  img {
    width: clamp(118px, 17vw, 148px);
    height: auto;
    border-radius: 10px;
    flex-shrink: 0;
  }
  .course {
    display: flex;
    gap: 16px;
    align-items: center;
    font-size: 12px;
    margin-top: 17px;
  }
  .course strong {
    background: #ede8fa;
    padding: 7px 11px;
    border-radius: 7px;
    color: #63508f;
  }
  footer {
    border-top: 1px solid #e8e4f0;
    padding-top: 16px;
    display: flex;
    justify-content: space-between;
    gap: 20px;
    font-size: 10px;
    color: #726c80;
    line-height: 1.6;
  }
  .active {
    white-space: nowrap;
    color: #3b7a62;
  }
  @media (max-width: 540px) {
    .student-card {
      padding: 21px;
    }
    .card-body {
      gap: 12px;
      align-items: flex-start;
    }
    h2 {
      font-size: 17px;
    }
    img {
      width: 94px;
      height: 94px;
    }
    footer {
      gap: 10px;
    }
  }
  @media print {
    .student-card {
      width: 170mm;
      max-width: none;
      break-inside: avoid;
      print-color-adjust: exact;
    }
  }
</style>
