export const USER_CREDENTIALS_EMAIL_TEMPLATE = `<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8" />
  <title>Credenciais de Acesso</title>
</head>
<body style="font-family: Arial, sans-serif; background:#f4f4f4; padding:20px;">

  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center">

        <table width="600" cellpadding="0" cellspacing="0" 
          style="background:#ffffff; border-radius:10px; padding:40px;">

          <tr>
            <td align="center">
              <h1 style="color:#1e3a8a;">
                Campos de Ténis Tunduro
              </h1>
            </td>
          </tr>

          <tr>
            <td>
              <p>Olá <strong>{{nome}}</strong>,</p>

              <p>
                A sua conta foi criada com sucesso na plataforma 
                <strong>Campos de Ténis Tunduro</strong>.
              </p>

              <p>Use as credenciais abaixo para acessar o sistema:</p>

              <div style="
                background:#f3f4f6;
                padding:20px;
                border-radius:8px;
                margin:20px 0;
              ">
                <p><strong>Email:</strong> {{email}}</p>
                <p><strong>Senha:</strong> {{senha}}</p>
              </div>

              <p>
                Recomendamos alterar a senha após o primeiro login.
              </p>

              <p>
                Clique no botão abaixo para acessar o sistema:
              </p>

              <p style="text-align:center; margin:30px 0;">
                <a href="{{frontend_url}}" 
                  style="
                    background:#2563eb;
                    color:white;
                    padding:12px 24px;
                    text-decoration:none;
                    border-radius:6px;
                    display:inline-block;
                  ">
                  Acessar Plataforma
                </a>
              </p>

              <p>
                Caso tenha alguma dificuldade, entre em contacto com o administrador.
              </p>

              <br />

              <p>
                Atenciosamente,<br />
                <strong>Equipa Campos de Ténis Tunduro</strong>
              </p>
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>

</body>
</html>
`;
