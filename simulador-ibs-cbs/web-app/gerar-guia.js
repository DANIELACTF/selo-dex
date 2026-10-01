#!/usr/bin/env node
/* Gera o guia de instalação (guia-instalacao.html), no mesmo formato do guia
   do Onboarding Fiscal: um cartão por arquivo, com botão Copiar e o código.

   O código entra no guia direto dos arquivos desta pasta, então o guia nunca
   fica com uma versão diferente da do repositório.

   Uso: node simulador-ibs-cbs/web-app/gerar-guia.js            grava o guia
        node simulador-ibs-cbs/web-app/gerar-guia.js --conferir avisa se está desatualizado */
'use strict';
const fs = require('fs');
const path = require('path');

const VERSAO = '1.1';
const ler = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const linhas = (s) => s.replace(/\n$/, '').split('\n').length;

const ARQUIVOS = [
  { arquivo: 'Codigo.gs', titulo: 'Código.gs', tipo: 'Script', nome: null,
    como: 'Já existe no projeto · <strong>Script</strong> · apague tudo e cole por cima',
    desc: 'Abre o simulador pelo menu da planilha ou pelo link e guarda as simulações nas abas Simulações e Resultado.' },
  { arquivo: 'pagina.html', titulo: 'pagina.html', tipo: 'HTML', nome: 'pagina',
    como: 'Novo arquivo · <strong>HTML</strong> · nome <code>pagina</code>',
    desc: 'A tela inteira: as abas Simular, Resultado e Tabelas, o formulário das operações e o gráfico.' },
  { arquivo: 'motor_js.html', titulo: 'motor_js.html', tipo: 'HTML', nome: 'motor_js',
    como: 'Novo arquivo · <strong>HTML</strong> · nome <code>motor_js</code>',
    desc: 'As contas: tratamentos por atividade, cronograma 2026–2033, créditos e o cálculo de cada ano.' }
];

const cartoes = ARQUIVOS.map((a, i) => {
  const codigo = ler(a.arquivo);
  const n = String(i + 1).padStart(2, '0');
  return `      <article class="arquivo">
        <div class="arquivo-topo">
          <div class="arquivo-id">
            <span class="arquivo-n">${n}</span>
            <div>
              <h3>${esc(a.titulo)}</h3>
              <p class="arquivo-como">${a.como}</p>
            </div>
          </div>
          <button class="copiar" type="button" id="copiar-${i + 1}" data-alvo="src-${i + 1}" aria-label="Copiar ${esc(a.titulo)}">Copiar</button>
        </div>
        <p class="arquivo-desc">${a.desc}</p>
        <details>
          <summary>Ver o código (${linhas(codigo)} linhas)</summary>
          <pre id="src-${i + 1}"><code>${esc(codigo)}</code></pre>
        </details>
      </article>`;
}).join('\n\n');

const guia = `<title>Simulador IBS/CBS na planilha</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@600;700&family=IBM+Plex+Mono:wght@400;500;600&family=Public+Sans:ital,wght@0,400;0,500;0,600;1,400&display=swap">
<style>
  /* Guia de instalação no mesmo formato do Onboarding Fiscal, com as cores e
     fontes do próprio simulador (as do Quadro de Férias): capa azul-tinta,
     cartões por arquivo, barra de progresso fixa no topo. */
  :root {
    --tinta: #2A3EA6;
    --tinta-clara: #3B52C4;
    --capa-texto: #FFFFFF;
    --fundo: #EFF1F6;
    --superficie: #FFFFFF;
    --superficie-2: #E4E7F0;
    --texto: #131826;
    --texto-suave: #4B5468;
    --linha: #D5D9E4;
    --linha-forte: #B7BFD1;
    --alerta: #AE3327;
    --atencao: #8F5D0C;
    --atencao-fundo: #FAEEDA;
    --ok: #1D6B47;
    --codigo-fundo: #F5F6FA;
    --sombra: 0 1px 2px rgba(19, 24, 38, .06), 0 8px 24px -12px rgba(19, 24, 38, .18);
    --f-titulo: "Archivo", "Helvetica Neue", Arial, sans-serif;
    --f-texto: "Public Sans", "Helvetica Neue", Arial, sans-serif;
    --f-mono: "IBM Plex Mono", ui-monospace, SFMono-Regular, Consolas, monospace;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --tinta: #8D9CFF; --tinta-clara: #AAB6FF; --capa-texto: #0E121C;
      --fundo: #0E121C; --superficie: #161B29; --superficie-2: #1E2540;
      --texto: #E8EBF3; --texto-suave: #A9B1C4; --linha: #2A3143; --linha-forte: #3B4356;
      --alerta: #F0897A; --atencao: #E2B463; --atencao-fundo: #2A2113; --ok: #63C395;
      --codigo-fundo: #111624; --sombra: 0 1px 2px rgba(0, 0, 0, .4);
      color-scheme: dark;
    }
  }
  :root[data-theme="dark"] {
    --tinta: #8D9CFF; --tinta-clara: #AAB6FF; --capa-texto: #0E121C;
    --fundo: #0E121C; --superficie: #161B29; --superficie-2: #1E2540;
    --texto: #E8EBF3; --texto-suave: #A9B1C4; --linha: #2A3143; --linha-forte: #3B4356;
    --alerta: #F0897A; --atencao: #E2B463; --atencao-fundo: #2A2113; --ok: #63C395;
    --codigo-fundo: #111624; --sombra: 0 1px 2px rgba(0, 0, 0, .4);
    color-scheme: dark;
  }

  * { box-sizing: border-box; }
  body { background: var(--fundo); color: var(--texto); font-family: var(--f-texto); font-size: 16px; line-height: 1.6; margin: 0; }

  .envelope { max-width: 860px; margin: 0 auto; padding-inline: 20px; padding-block: 0 72px; }

  .capa { background: var(--tinta); color: var(--capa-texto); padding: 40px 20px 34px; }
  .capa-interno { max-width: 820px; margin: 0 auto; }
  .eyebrow { font-family: var(--f-mono); font-size: 12px; letter-spacing: .16em; text-transform: uppercase; opacity: .85; margin: 0 0 10px; }
  h1 { font-family: var(--f-titulo); font-size: clamp(30px, 6vw, 42px); line-height: 1.1; font-weight: 700; letter-spacing: -.015em; text-wrap: balance; margin: 0 0 12px; }
  .capa p { margin: 0; max-width: 62ch; opacity: .94; }
  .capa-meta { display: flex; flex-wrap: wrap; gap: 8px 10px; margin-top: 22px; font-family: var(--f-mono); font-size: 12.5px; }
  .capa-meta span { border: 1px solid currentColor; border-radius: 3px; padding: 3px 9px; opacity: .92; }

  .progresso {
    position: sticky; top: env(safe-area-inset-top, 0px); z-index: 10;
    background: var(--superficie); border-bottom: 1px solid var(--linha);
    margin-inline: -20px; padding: 10px 20px;
    display: flex; align-items: center; gap: 14px; font-family: var(--f-mono); font-size: 13px;
  }
  .barra { flex: 1; height: 6px; background: var(--superficie-2); border-radius: 3px; overflow: hidden; }
  .barra i { display: block; height: 100%; width: 0%; background: var(--tinta); transition: width .25s ease; }
  .progresso button { background: none; border: 1px solid var(--linha-forte); border-radius: 4px; color: var(--texto-suave); font: inherit; font-size: 12px; padding: 3px 9px; cursor: pointer; }
  .progresso button:hover { color: var(--texto); border-color: var(--texto-suave); }

  section { margin-top: 48px; }
  .passo-cab { display: flex; align-items: baseline; gap: 14px; border-bottom: 2px solid var(--tinta); padding-bottom: 10px; margin-bottom: 20px; flex-wrap: wrap; }
  .passo-n { font-family: var(--f-mono); font-size: 13px; font-weight: 600; color: var(--tinta); letter-spacing: .08em; white-space: nowrap; }
  h2 { font-family: var(--f-titulo); font-size: clamp(21px, 4vw, 26px); font-weight: 700; line-height: 1.2; text-wrap: balance; margin: 0; letter-spacing: -.01em; }
  h3 { font-family: var(--f-titulo); font-size: 17px; font-weight: 700; margin: 0; }
  p { margin: 0 0 14px; max-width: 68ch; }
  section > p:last-child { margin-bottom: 0; }

  ol.etapas { margin: 0; padding: 0; list-style: none; counter-reset: etapa; }
  ol.etapas > li { counter-increment: etapa; display: grid; grid-template-columns: 30px 1fr; gap: 4px 14px; padding: 14px 0; border-bottom: 1px solid var(--linha); }
  ol.etapas > li:last-child { border-bottom: none; }
  ol.etapas > li::before {
    content: counter(etapa); font-family: var(--f-mono); font-size: 13px; font-weight: 600;
    color: var(--texto-suave); background: var(--superficie-2); border-radius: 3px;
    width: 26px; height: 26px; display: grid; place-items: center; margin-top: 2px;
  }
  ol.etapas > li > * { grid-column: 2; margin-bottom: 0; min-width: 0; }
  ol.etapas > li > * + * { margin-top: 8px; }

  .rolagem { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  table { width: 100%; border-collapse: collapse; font-size: 14.5px; min-width: 460px; }
  th, td { text-align: left; vertical-align: top; padding: 9px 12px; border-bottom: 1px solid var(--linha); }
  thead th { font-family: var(--f-mono); font-size: 11.5px; text-transform: uppercase; letter-spacing: .07em; color: var(--texto-suave); border-bottom: 1px solid var(--linha-forte); font-weight: 600; }
  tbody tr:last-child td { border-bottom: none; }

  .nota { border-left: 3px solid var(--linha-forte); background: var(--superficie); padding: 13px 16px; margin: 16px 0; font-size: 15px; }
  .nota p { margin: 0; }
  .nota p + p { margin-top: 10px; }
  .nota.atencao { border-left-color: var(--atencao); background: var(--atencao-fundo); }

  .arquivos { display: flex; flex-direction: column; gap: 12px; }
  .arquivo { background: var(--superficie); border: 1px solid var(--linha); border-radius: 6px; padding: 14px 16px; box-shadow: var(--sombra); min-width: 0; }
  .arquivo.pronto { border-color: var(--ok); }
  .arquivo-topo { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
  .arquivo-id { display: flex; gap: 12px; align-items: flex-start; min-width: 0; }
  .arquivo-n { font-family: var(--f-mono); font-size: 12px; font-weight: 600; color: var(--tinta); background: var(--superficie-2); border-radius: 3px; padding: 4px 7px; margin-top: 1px; }
  .arquivo h3 { font-size: 16px; font-family: var(--f-mono); font-weight: 600; }
  .arquivo-como { margin: 2px 0 0; font-size: 13.5px; color: var(--texto-suave); }
  .arquivo-desc { margin: 10px 0 0; font-size: 14.5px; color: var(--texto-suave); }
  .arquivo details { margin-top: 10px; }
  .arquivo summary { cursor: pointer; font-family: var(--f-mono); font-size: 12.5px; color: var(--texto-suave); padding: 3px 0; }
  .arquivo summary:hover { color: var(--texto); }

  button.copiar { font-family: var(--f-mono); font-size: 12.5px; font-weight: 600; background: var(--tinta); color: var(--capa-texto); border: 0; border-radius: 4px; padding: 7px 16px; cursor: pointer; white-space: nowrap; }
  button.copiar:hover { background: var(--tinta-clara); }
  button.copiar.feito { background: var(--ok); }

  pre { background: var(--codigo-fundo); border: 1px solid var(--linha); border-radius: 4px; padding: 12px 14px; overflow: auto; margin: 8px 0 0; font-size: 12.5px; line-height: 1.55; max-height: 380px; }
  pre, code { font-family: var(--f-mono); }
  code { font-size: .92em; }
  p code, li code, td code { background: var(--superficie-2); border-radius: 3px; padding: 1px 5px; }
  pre code { background: none; padding: 0; }
  .perigo { color: var(--alerta); }

  :focus-visible { outline: 2px solid var(--tinta); outline-offset: 2px; }
  @media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
  @media (max-width: 560px) {
    .arquivo-topo { flex-direction: column; align-items: stretch; }
    button.copiar { width: 100%; padding: 9px 16px; }
  }
</style>

<div class="capa">
  <div class="capa-interno">
    <p class="eyebrow">Reforma tributária · regime regular</p>
    <h1>Simulador IBS/CBS dentro da planilha</h1>
    <p>Compara a carga de hoje (ICMS, ISS, IPI, PIS e COFINS) com a de cada ano
    da transição, de 2026 a 2033, para empresas do Lucro Real e do Lucro
    Presumido. O código fica no Apps Script da própria planilha, e o simulador
    abre pelo menu.</p>
    <div class="capa-meta">
      <span>versão ${VERSAO}</span>
      <span>${ARQUIVOS.length} arquivos</span>
      <span>~10 minutos</span>
    </div>
  </div>
</div>

<div class="envelope">

  <div class="progresso">
    <span id="contador">0 / ${ARQUIVOS.length}</span>
    <div class="barra"><i id="barra"></i></div>
    <button type="button" id="zerar">Recomeçar</button>
  </div>

  <section>
    <div class="passo-cab">
      <span class="passo-n">O QUE É</span>
      <h2>O que você vai ter no fim</h2>
    </div>
    <p>Um menu <strong>Simulador IBS/CBS → Abrir o simulador</strong> na planilha.
    Ele abre uma janela com três abas.</p>
    <div class="rolagem">
      <table>
        <thead><tr><th>Aba</th><th>O que tem</th></tr></thead>
        <tbody>
          <tr><td>Simular</td><td>Empresa e premissas, as vendas e as compras do período, e as simulações salvas</td></tr>
          <tr><td>Resultado</td><td>Carga de hoje comparada com cada ano, gráfico, preço e margem, débitos e créditos de IBS/CBS e o detalhamento por atividade</td></tr>
          <tr><td>Tabelas</td><td>O cronograma da transição (editável) e o catálogo de tratamentos por atividade, com busca</td></tr>
        </tbody>
      </table>
    </div>
    <div class="nota">
      <p><strong>Cada operação tem a sua atividade.</strong> Redução de 30% para
      profissões regulamentadas, 60% para saúde, educação e alimentos, alíquota
      zero na cesta básica, 40% em bares, restaurantes e hotelaria, 50% e 70% em
      imóveis, alíquota própria nos serviços financeiros, exportação e mais. O
      formulário avisa o que informar em "Valor" e quando a compra não dá crédito.</p>
    </div>
    <h3 style="margin-top:26px">Para empresas de serviço</h3>
    <p>Escolha <strong>Prestação de serviços</strong> em "Perfil da atividade", no
    Passo 1 do simulador. Muda isto:</p>
    <div class="rolagem">
      <table>
        <thead><tr><th>O quê</th><th>Como funciona</th></tr></thead>
        <tbody>
          <tr><td>ISS do município</td><td>Vira o padrão de cada serviço lançado. Cai a 90%, 80%, 70% e 60% de 2029 a 2032 e acaba em 2033.</td></tr>
          <tr><td>ISS fixo</td><td>Para sociedade de profissionais, que paga ISS por profissional e não sobre o faturamento.</td></tr>
          <tr><td>Folha e custos sem crédito</td><td>Entram no resultado. São o motivo de serviços terem pouco crédito de IBS/CBS para abater.</td></tr>
          <tr><td>Clientes que se creditam</td><td>Empresa do regime regular recupera o IBS/CBS; pessoa física, Simples e consumidor final pagam cheio.</td></tr>
          <tr><td>Preço e margem</td><td>Resultado antes de IR em cada ano, o reajuste para manter o resultado de hoje e quanto muda o preço para cada tipo de cliente.</td></tr>
        </tbody>
      </table>
    </div>
  </section>

  <section>
    <div class="passo-cab">
      <span class="passo-n">PASSO 1</span>
      <h2>A planilha</h2>
    </div>
    <ol class="etapas">
      <li><p>Na barra de endereço do navegador, digite <strong>sheets.new</strong>.
      Abre uma planilha em branco.</p></li>
      <li><p>Clique em <em>Planilha sem título</em> e dê o nome
      <strong>Simulador IBS/CBS</strong>.</p></li>
    </ol>
    <p>As simulações salvas ficam nessa planilha. As abas <code>Simulações</code>
    e <code>Resultado</code> aparecem sozinhas na primeira vez que você usar.</p>
  </section>

  <section>
    <div class="passo-cab">
      <span class="passo-n">PASSO 2</span>
      <h2>O código</h2>
    </div>
    <p>Na planilha: <strong>Extensões → Apps Script</strong>. Abre uma aba nova
    com o arquivo <code>Código.gs</code> aberto.</p>
    <div class="nota atencao">
      <p><strong>Já tinha colado a versão anterior do simulador</strong>
      (<code>SimuladorIBSCBS.gs</code>)? Apague esse arquivo (⋮ → Excluir) ou todo o
      conteúdo dele. As duas versões criam o mesmo menu e uma atrapalha a outra.</p>
    </div>
    <p>O primeiro arquivo substitui o <code>Código.gs</code> que já existe. Para
    os outros dois, clique no <strong>+</strong> ao lado de "Arquivos", escolha
    <strong>HTML</strong> e dê o nome exato, <strong>sem a extensão</strong> (o
    editor põe o <code>.html</code> sozinho). Apague o que vier pronto e cole.
    Conforme você copia, o arquivo fica marcado. A marcação fica salva neste
    navegador se você precisar parar no meio.</p>
    <div class="arquivos">
${cartoes}
    </div>
    <p style="margin-top:18px">Salve com o ícone de <strong>disquete</strong> ou <code>Ctrl+S</code>.
    A coluna da esquerda deve mostrar exatamente <code>Código.gs</code>,
    <code>pagina.html</code> e <code>motor_js.html</code>.</p>
    <div class="nota atencao">
      <p>Os nomes <code>pagina</code> e <code>motor_js</code> precisam estar
      assim mesmo: minúsculos, sem acento e do tipo <strong>HTML</strong>. Com
      outro nome, a janela do simulador abre em branco.</p>
    </div>
  </section>

  <section>
    <div class="passo-cab">
      <span class="passo-n">PASSO 3</span>
      <h2>Abrir o simulador</h2>
    </div>
    <ol class="etapas">
      <li><p>Volte à aba da planilha e <strong>recarregue a página (F5)</strong>.
      Colar código no editor não atualiza o menu de uma aba que já estava aberta.</p></li>
      <li><p>Espere alguns segundos: aparece o menu <strong>Simulador IBS/CBS</strong>,
      ao lado de <em>Ajuda</em>.</p></li>
      <li>
        <p>Clique em <strong>Simulador IBS/CBS → Abrir o simulador</strong>. Na
        primeira vez o Google pede autorização: escolha sua conta.</p>
        <p>Vai aparecer "O Google não verificou este app". Clique em
        <strong>Avançado → Acessar Simulador IBS/CBS (não seguro)</strong> e depois em
        <strong>Permitir</strong>. "Não verificado" quer dizer que o app é seu e não
        passou pela revisão pública do Google, não que tenha algo errado com ele.</p>
      </li>
      <li><p>Abra o menu de novo. Para testar, clique em <strong>Usar exemplo</strong>
      e depois em <strong>Ver o resultado</strong>. Com o perfil "Prestação de serviços",
      o exemplo é o de uma prestadora de serviços.</p></li>
    </ol>
    <h3 style="margin-top:26px">As permissões que ele pede</h3>
    <div class="rolagem">
      <table>
        <thead><tr><th>Permissão</th><th>Para quê</th></tr></thead>
        <tbody>
          <tr><td>Ver, editar e criar planilhas</td><td>guardar as simulações e gravar o resultado nas abas Simulações e Resultado</td></tr>
          <tr><td>Exibir e executar conteúdo de terceiros</td><td>abrir a janela do simulador dentro da planilha</td></tr>
        </tbody>
      </table>
    </div>
    <p style="margin-top:14px">Quem tiver acesso de edição a esta planilha também usa o
    simulador pelo menu.</p>
  </section>

  <section>
    <div class="passo-cab">
      <span class="passo-n">OPCIONAL</span>
      <h2>Ter um link próprio</h2>
    </div>
    <p>Para abrir o simulador numa aba do navegador ou no celular, sem passar pela planilha.</p>
    <ol class="etapas">
      <li><p>No Apps Script: <strong>Implantar → Nova implantação</strong>.</p></li>
      <li><p>Na <strong>engrenagem</strong> ao lado de "Selecione o tipo", escolha
      <strong>App da Web</strong>.</p></li>
      <li><p><strong>Executar como:</strong> <em>Eu</em>. <strong>Quem pode acessar:</strong>
      <em>Somente eu</em>, ou <em>Qualquer pessoa na organização</em> se a equipe for usar.</p></li>
      <li><p>Clique em <strong>Implantar</strong> e copie o endereço que termina em <code>/exec</code>.</p></li>
    </ol>
    <div class="nota atencao">
      <p><strong>Evite "Qualquer pessoa".</strong> O app roda com a sua conta:
      quem tiver o link consegue ver e apagar as simulações salvas, que podem ter
      dados de clientes.</p>
      <p>Mudou o código depois? O link não se atualiza sozinho. Vá em
      <strong>Implantar → Gerenciar implantações → lápis → Versão: Nova versão →
      Implantar</strong>. Pelo menu da planilha, basta salvar.</p>
    </div>
  </section>

  <section>
    <div class="passo-cab">
      <span class="passo-n">SE DER ERRO</span>
      <h2>O que costuma acontecer</h2>
    </div>
    <div class="rolagem">
      <table>
        <thead><tr><th>O que aparece</th><th>O que fazer</th></tr></thead>
        <tbody>
          <tr><td>O menu não aparece</td><td>Recarregue a planilha e espere uns 10 segundos. Se continuar, no Apps Script escolha <code>onOpen</code> na lista ao lado de "Depurar", clique em <strong>Executar</strong>, autorize e recarregue a planilha.</td></tr>
          <tr><td>"Cannot call SpreadsheetApp.getUi() from this context"</td><td>Você clicou em Executar no editor. Abra pelo menu da planilha.</td></tr>
          <tr><td>Janela em branco, ou "Nenhum arquivo HTML com o nome pagina" (ou <code>motor_js</code>)</td><td>Nome de arquivo errado ou tipo errado. Confira <code>pagina</code> e <code>motor_js</code>, do tipo HTML.</td></tr>
          <tr><td>"SyntaxError" ao salvar</td><td>A cópia ficou incompleta. Apague o arquivo inteiro e use o botão Copiar de novo.</td></tr>
          <tr><td>"Sem ligação com a planilha"</td><td>O arquivo foi aberto fora do Google. Abra pelo menu ou pelo link do app da Web.</td></tr>
        </tbody>
      </table>
    </div>
  </section>

  <section>
    <div class="passo-cab">
      <span class="passo-n">LIMITES</span>
      <h2>O que ainda não foi testado ao vivo</h2>
    </div>
    <p>As contas, o código que grava na planilha e a tela têm testes automáticos.
    A tela rodou num navegador de verdade, ligada ao código sobre uma planilha
    simulada. O que só se prova na sua conta:</p>
    <ol class="etapas">
      <li><p><strong>A instalação no Google.</strong> Os nomes de menu e botão
      aqui são os da interface em português; se algum estiver um pouco diferente,
      a sequência é a mesma.</p></li>
      <li><p><strong>As alíquotas de referência.</strong> CBS de 8,8% e IBS de 17,7%
      são estimativas: ajuste no Passo 1 do simulador quando forem publicadas.</p></li>
      <li><p><strong>O enquadramento de cada item nos anexos da LC 214/2025.</strong>
      O simulador aplica a redução que você escolher; conferir se o produto ou
      serviço está na lista fica com você.</p></li>
    </ol>
  </section>
</div>

<script>
(function () {
  var TOTAL = ${ARQUIVOS.length};
  var CHAVE = 'simulador-ibscbs-instalacao-v${VERSAO}';
  var feitos = {};
  try { feitos = JSON.parse(localStorage.getItem(CHAVE) || '{}') || {}; } catch (e) { feitos = {}; }
  function salvar() {
    try { localStorage.setItem(CHAVE, JSON.stringify(feitos)); } catch (e) { /* aba anônima */ }
  }
  function pintar() {
    var n = 0;
    document.querySelectorAll('button.copiar').forEach(function (botao) {
      var alvo = botao.dataset.alvo;
      var cartao = botao.closest('.arquivo');
      if (feitos[alvo]) {
        n++;
        botao.classList.add('feito');
        botao.textContent = 'Copiado ✓';
        cartao.classList.add('pronto');
      } else {
        botao.classList.remove('feito');
        botao.textContent = 'Copiar';
        cartao.classList.remove('pronto');
      }
    });
    document.getElementById('contador').textContent = n + ' / ' + TOTAL;
    document.getElementById('barra').style.width = (n / TOTAL * 100) + '%';
  }
  document.querySelectorAll('button.copiar').forEach(function (botao) {
    botao.addEventListener('click', function () {
      var alvo = botao.dataset.alvo;
      var pre = document.getElementById(alvo);
      var texto = pre.textContent;
      function marcar() { feitos[alvo] = true; salvar(); pintar(); }
      function selecionar() {
        // Sem permissão de área de transferência: abre o código e seleciona
        // tudo, para a pessoa copiar com Ctrl+C.
        var detalhe = pre.closest('details');
        if (detalhe) detalhe.open = true;
        var faixa = document.createRange();
        faixa.selectNodeContents(pre);
        var selecao = window.getSelection();
        selecao.removeAllRanges();
        selecao.addRange(faixa);
        botao.textContent = 'Copie com Ctrl+C';
      }
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(texto).then(marcar, selecionar);
        } else {
          selecionar();
        }
      } catch (e) { selecionar(); }
    });
  });
  document.getElementById('zerar').addEventListener('click', function () {
    feitos = {};
    salvar();
    pintar();
  });
  pintar();
})();
</script>
`;

const destino = path.join(__dirname, 'guia-instalacao.html');
if (process.argv.includes('--conferir')) {
  const atual = fs.existsSync(destino) ? fs.readFileSync(destino, 'utf8') : '';
  if (atual !== guia) { console.error('guia-instalacao.html desatualizado — rode: node simulador-ibs-cbs/web-app/gerar-guia.js'); process.exit(1); }
  console.log('guia-instalacao.html em dia com os arquivos.');
} else {
  fs.writeFileSync(destino, guia);
  console.log('guia-instalacao.html — ' + guia.length + ' bytes');
}
