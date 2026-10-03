import ApropriacaoAutocomplete from './ApropriacaoAutocomplete';

/**
 * Pesquisa de obras usando o mesmo combobox acessivel do catalogo de apropriacoes.
 *
 * O componente nao estabelece quantidade minima de caracteres: com o campo vazio mostra todo o
 * catalogo recebido e, desde o primeiro caractere, filtra por codigo ou nome. Quando `onSearch`
 * e informado, a tela tambem pode atualizar as opcoes consultando o servidor. A origem e o
 * escopo das obras continuam sendo responsabilidade da tela que fornece `options`.
 */
export default function ObraAutocomplete({
  placeholder = 'Digite o codigo ou nome da obra...',
  disabledPlaceholder = 'Carregando obras ativas...',
  ...props
}) {
  return (
    <ApropriacaoAutocomplete
      {...props}
      placeholder={placeholder}
      disabledPlaceholder={disabledPlaceholder}
      emptyText="Nenhuma obra ativa encontrada"
      inputClassName="form-control"
      portalZIndex="var(--z-modal-acima)"
      mostrarConsultaCompleta={false}
    />
  );
}
