import type { ContractData, ContractTerms } from '@dcfoundry/shared';
import type { readCompany } from './company-settings.js';
type Company = NonNullable<Awaited<ReturnType<typeof readCompany>>>;
export const serviceLabels = {
  site_landing: 'Site e landing page',
  system_app: 'Sistema e aplicativo sob medida',
  paid_marketing: 'Tráfego pago e gestão de marketing',
  maintenance: 'Manutenção e suporte mensal',
};
const money = (value: number) =>
  (value / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export function renderServiceContract(
  id: string,
  company: Company,
  proposal: ContractData,
  terms: ContractTerms,
  proposalVersion: number,
  issuedAt: string,
) {
  const payer = (value: 'client' | 'provider') =>
    value === 'client' ? 'CONTRATANTE' : 'CONTRATADA';
  const specific = {
    site_landing:
      'O serviço compreende a construção das páginas e funcionalidades descritas no escopo, com adaptação a dispositivos móveis. Produção de textos, fotos, identidade visual, migração e integrações somente estarão incluídas se expressamente relacionadas no escopo. Publicação depende de acesso aos serviços e da aprovação do cliente.',
    system_app:
      'O serviço compreende os módulos, fluxos e integrações expressamente descritos no escopo. Novas regras de negócio, integrações adicionais, migrações não especificadas, mudanças estruturais e expansão de plataformas dependem de orçamento e aprovação próprios. Publicação em lojas de aplicativos depende das regras, contas e aprovações de terceiros.',
    paid_marketing:
      'O serviço compreende planejamento, configuração e acompanhamento das ações de marketing descritas no escopo. A verba de mídia será paga pela CONTRATANTE diretamente às plataformas e não integra a remuneração de gestão. Não há garantia de posição em buscas, volume de tráfego, leads, vendas, aprovação de anúncios, faturamento ou retorno financeiro. Resultados dependem de mercado, orçamento, oferta, conteúdo, concorrência e decisões das plataformas.',
    maintenance:
      'O serviço compreende as rotinas de suporte e manutenção expressamente descritas no escopo, durante a vigência contratada. Solicitações devem ser registradas no canal de suporte ou portal do cliente. Desenvolvimento de funcionalidades novas, redesenho, migrações e intervenções fora do escopo exigem orçamento e aprovação próprios.',
  }[terms.serviceType];
  const payment =
    proposal.billing === 'monthly'
      ? `Mensalidade de ${money(proposal.valueCents)}, com vencimento no dia ${terms.paymentDay} de cada mês.`
      : `Valor total de ${money(proposal.valueCents)}. Entrada de ${money(terms.upfrontCents)} e saldo de ${money(proposal.valueCents - terms.upfrontCents)} em ${terms.installments} parcela(s). Eventual diferença de centavos na divisão será ajustada na última parcela.`;
  return [
    'modelo, revisar com advogado',
    `CONTRATO DE PRESTAÇÃO DE SERVIÇOS\n${serviceLabels[terms.serviceType]}\nReferência ${id} · Proposta versão ${proposalVersion}\nElaborado em ${issuedAt}`,
    `1. PARTES\nCONTRATADA: ${company.name}, ${company.document.length === 11 ? 'CPF' : 'CNPJ'} ${company.document}, endereço ${company.address}, e-mail ${company.email}, telefone ${company.phone}, representada por ${company.representative}.\nCONTRATANTE: ${proposal.client}, ${proposal.clientDocument.length === 11 ? 'CPF' : 'CNPJ'} ${proposal.clientDocument}, endereço ${proposal.clientAddress}, e-mail ${proposal.clientEmail || 'a informar pelo cliente'}, representada por ${proposal.clientRepresentative || proposal.client}.`,
    `2. OBJETO E ESCOPO\n${proposal.scope}\n${specific}`,
    `3. ENTREGÁVEIS E EXCLUSÕES\nEntregáveis: ${terms.deliverables}\nNão incluído: ${terms.outOfScope}\nAtividades não previstas dependem de orçamento complementar e aprovação escrita antes de sua execução.`,
    `4. ETAPAS, PRAZOS E APROVAÇÕES\n${terms.timeline}\nOs prazos pressupõem o fornecimento de materiais, acessos e decisões pela CONTRATANTE nos marcos combinados. Atrasos desses insumos suspendem os marcos afetados e exigem replanejamento comunicado entre as partes. Mudanças de escopo e revisões extraordinárias podem alterar o cronograma mediante acordo escrito.`,
    `5. REVISÕES\nIncluem-se ${terms.revisionsIncluded} rodada(s) de revisão dos entregáveis previstos, com apontamentos consolidados pela CONTRATANTE. Revisão não inclui alteração do objeto ou novas funcionalidades. Rodadas extras ${terms.extraRevisionCents ? `têm valor de ${money(terms.extraRevisionCents)} por rodada` : 'dependem de orçamento complementar específico'}, sempre mediante aprovação prévia.`,
    `6. REMUNERAÇÃO E PAGAMENTO\n${payment}\nCondições: ${terms.paymentTerms}\nO atraso sujeita a parcela vencida a multa de ${terms.latePenaltyPercent}% e juros simples de ${terms.monthlyInterestPercent}% ao mês, calculados proporcionalmente aos dias de atraso, observados os limites legais aplicáveis. Eventual suspensão por inadimplência será precedida de comunicação e não autoriza eliminação de dados ou de entregas já quitadas.`,
    `7. REAJUSTE\n${terms.adjustmentIndex === 'sem reajuste' ? 'Não há reajuste automático previsto neste instrumento.' : `Em obrigações continuadas superiores a doze meses, o valor poderá ser reajustado a cada doze meses pelo ${terms.adjustmentIndex}, mediante comunicação do cálculo. Alterações de escopo dependem de acordo próprio e não se confundem com reajuste.`}`,
    `8. PROPRIEDADE INTELECTUAL E PORTFÓLIO\nApós a quitação integral dos valores devidos pelos respectivos entregáveis, os direitos patrimoniais sobre código e design criados especificamente para este projeto serão transferidos à CONTRATANTE. Bibliotecas, frameworks, componentes preexistentes, ferramentas e materiais de terceiros permanecem sujeitos às suas licenças. A CONTRATADA poderá apresentar o projeto em seu portfólio, preservando informações confidenciais, acessos e dados pessoais; materiais sujeitos a restrição específica dependem de autorização apropriada.`,
    `9. HOSPEDAGEM, DOMÍNIO E TERCEIROS\nHospedagem: custos e contratação sob responsabilidade da ${payer(terms.hostingPayer)}. Domínio: responsabilidade da ${payer(terms.domainPayer)}. Ferramentas e serviços de terceiros previstos no escopo: responsabilidade da ${payer(terms.toolsPayer)}. Serviços pagos pela CONTRATADA ficam limitados ao que estiver expressamente incluído no preço e na vigência. Valores adicionais exigem aprovação. Credenciais e titularidade serão organizadas para permitir acesso autorizado da CONTRATANTE. Indisponibilidades e mudanças de regras de terceiros serão comunicadas e avaliadas sem promessa de controle sobre esses serviços.`,
    `10. GARANTIA E SUPORTE\nA correção de defeitos reproduzíveis que contrariem o escopo entregue está incluída por ${terms.warrantyDays} dia(s) a contar do aceite da entrega, sem prejuízo de direitos legais aplicáveis. Não se confundem com defeito as alterações de escopo, intervenções não autorizadas ou falhas de terceiros. Em suporte mensal contratado, a meta para primeira resposta é de ${terms.supportResponseHours} hora(s) úteis, em dias úteis, no horário de atendimento acordado; diagnóstico, prioridade e previsão de solução serão informados no acompanhamento. Esse prazo de resposta não é promessa de resolução de qualquer incidente no mesmo intervalo.`,
    '11. CONFIDENCIALIDADE\nAs partes protegerão informações técnicas, comerciais, credenciais e materiais confidenciais recebidos para execução deste contrato, restringindo acesso às pessoas necessárias ao serviço. A obrigação subsiste após o encerramento. Divulgação legalmente exigida será limitada ao necessário e comunicada quando permitida.',
    '12. PROTEÇÃO DE DADOS\nNo tratamento de dados pessoais realizado em nome da CONTRATANTE para o serviço, a CONTRATANTE atua como controladora e a CONTRATADA como operadora, segundo instruções documentadas e a LGPD. As partes definirão finalidade, acessos, prazos de retenção e bases legais aplicáveis. A CONTRATADA adotará medidas de segurança proporcionais, comunicará incidentes sem demora injustificada e prestará apoio para o cumprimento das obrigações da controladora. Ao encerrar, dados serão devolvidos ou eliminados conforme instruções e deveres legais de conservação. Tratamentos realizados por cada parte para suas próprias obrigações legais e contratuais seguem suas responsabilidades próprias.',
    `13. VIGÊNCIA, RESCISÃO E AVISO\nA vigência corresponde ao cronograma e às condições desta contratação; em serviços mensais, renova-se enquanto não encerrada conforme o ajuste. A parte que pretender o encerramento comunicará a outra com ${terms.noticeDays} dia(s) de antecedência. Permanecem devidos serviços executados, entregas aprovadas e despesas de terceiros previamente autorizadas. Materiais quitados e acessos do cliente serão disponibilizados em transição organizada. Rescisão por descumprimento exige comunicação com indicação do problema e oportunidade razoável de correção quando cabível.`,
    '14. FORMALIZAÇÃO E RECIBO\nAlterações relevantes de escopo, preço e prazo exigem concordância registrada das partes. O comprovante de pagamento e eventual recibo podem ser vinculados à cobrança correspondente. O aceite eletrônico deste documento registra nome do signatário, data e hora, endereço IP e hash do conteúdo apresentado.',
    '15. FORO\nFica eleito o foro de Curitiba/PR para questões decorrentes deste instrumento, ressalvadas competências e garantias legais obrigatórias aplicáveis à relação.',
    '16. ACEITE\nAs partes devem revisar o modelo e as condições preenchidas antes de assinar. As assinaturas e suas evidências são registradas sobre a versão imutável deste documento.',
  ].join('\n\n');
}
