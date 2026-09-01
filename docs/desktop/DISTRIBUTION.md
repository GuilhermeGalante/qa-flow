# Distribuição Windows, assinatura e updater

O repositório contém toda a automação, mas nenhuma chave ou certificado. A ativação acontece exclusivamente no ambiente protegido do GitHub Actions.

## Secrets obrigatórios

Configure no repositório:

- `WINDOWS_CERTIFICATE_BASE64`: conteúdo Base64 do certificado de code signing em PFX;
- `WINDOWS_CERTIFICATE_PASSWORD`: senha de exportação do PFX;
- `WINDOWS_TIMESTAMP_URL`: endpoint HTTPS de timestamp recomendado pela autoridade certificadora;
- `TAURI_SIGNING_PRIVATE_KEY`: conteúdo ou path seguro da chave privada gerada pelo signer do Tauri;
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: senha da chave do updater, quando houver;
- `QA_FLOW_UPDATER_PUBLIC_KEY`: conteúdo da chave pública correspondente.

O certificado Windows e a chave minisign do updater têm finalidades diferentes. O primeiro estabelece a identidade do publisher para Windows/SmartScreen; o segundo impede que o aplicativo instale um pacote de atualização adulterado.

Gere o par do updater fora do repositório e mantenha a chave privada em backup seguro:

```powershell
npm run tauri signer generate -- -w C:\caminho-seguro\qa-flow-updater.key
```

Perder essa chave impede publicar atualizações para instalações que confiam na chave pública correspondente. Nunca use `.env` para o build de release: o Tauri lê `TAURI_SIGNING_PRIVATE_KEY` diretamente do ambiente do processo.

## Artefatos

O workflow produz:

- `*-online.exe`: instalador menor, que pode obter WebView2 durante a instalação;
- `*-offline.exe`: inclui o instalador offline do WebView2;
- `*-online.exe.sig`: assinatura verificada pelo updater;
- `latest.json`: manifesto estático consumido pelo aplicativo;
- `SHA256SUMS.txt`: checksums de todos os artefatos publicados.

O endpoint incorporado por padrão é:

```text
https://github.com/GuilhermeGalante/qa-flow/releases/latest/download/latest.json
```

Uma build sem `QA_FLOW_UPDATER_PUBLIC_KEY` não consulta a rede e informa na interface que o updater não foi ativado. Em produção, somente HTTPS é aceito. O endpoint `releases/latest` acompanha apenas o canal estável; prereleases continuam disponíveis para instalação manual e não são oferecidas automaticamente.

## Gates do pipeline

Antes de publicar, o job:

1. valida que todos os secrets obrigatórios existem;
2. roda os gates compartilhado e desktop;
3. importa o PFX com chave privada no store efêmero do runner;
4. gera e assina os instaladores online e offline;
5. exige `Get-AuthenticodeSignature` com status `Valid` nos dois pacotes;
6. gera o manifesto do updater usando a assinatura do instalador online;
7. instala, inicia e reinstala o aplicativo silenciosamente;
8. desinstala e confirma que os dados do usuário foram preservados;
9. publica primeiro uma GitHub Release em draft.

O verificador estático local roda dentro de `npm run check:desktop`:

```powershell
npm run verify:desktop-distribution
```

Referências oficiais: [Updater do Tauri](https://v2.tauri.app/plugin/updater/), [assinatura Windows](https://v2.tauri.app/distribute/sign/windows/) e [opções de WebView2](https://v2.tauri.app/distribute/windows-installer/).
