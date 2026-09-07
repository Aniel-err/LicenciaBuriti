import { expect, test, type Page } from "@playwright/test";

const process = { id: "proc-1", number: "2026.000001", protocol: "BURITI-2026-000001", entrepreneurId: "emp-1", enterpriseId: "end-1", analyst: { name: "Ana Silva" }, licenseType: "LUA", status: "EM_ANALISE", openedAt: "2026-07-01T10:00:00.000Z", dueDate: "2026-08-01T10:00:00.000Z", documents: [{ id: "doc-missing", name: "Requerimento", status: "VALIDADO", fileName: "requerimento.pdf" }], messages: [], history: [], issuedDocs: [], conditions: [] };

async function mockApi(page: Page, role = "ADMIN") {
  let inspectionValidated = false;
  await page.route("http://localhost:3333/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/inspections/insp-1/validate" && route.request().method() === "PATCH") {
      inspectionValidated = true;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: "insp-1", status: "VALIDADA" }) });
      return;
    }
    if (url.pathname === "/documents/doc-missing/download") {
      await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: "Arquivo não encontrado" }) });
      return;
    }
    const bodies: Record<string, unknown> = {
      "/auth/login": { token: "test-token", user: { id: "user-1", name: "Ana Silva", email: "ana@buriti.ma.gov.br", role, entrepreneurId: role === "EMPREENDEDOR" ? "emp-1" : undefined } },
      "/processes": [process],
      "/entrepreneurs": [{ id: "emp-1", personType: "PJ", name: "Empresa Buriti", cnpj: "12345678000190", legalRepresentative: "Ana", phone: "98999999999", email: "empresa@example.test", address: "Buriti/MA" }],
      "/technical-managers": [{ id: "manager-1", entrepreneurId: "emp-1", enterpriseId: "end-1", name: "Daniel Araújo", cpf: "12345678901", council: "CREA-MA", professionalId: "000002", phone: "98999999999", email: "daniel@example.test", artAvailable: false }],
      "/enterprises": [{ id: "end-1", entrepreneurId: "emp-1", name: "Unidade Ambiental", address: "Centro", municipality: "Buriti - MA", latitude: -3.9, longitude: -42.9, activityId: "act-1", areaHectares: 1, size: "Médio", pollutionLevel: "Médio", propertyClass: "Urbano" }],
      "/catalog/activities": [{ id: "act-1", code: "01", description: "Atividade", size: "Médio", pollutionLevel: "Médio", requiredLicenses: ["LUA"], requiredDocuments: ["Requerimento"] }],
      "/catalog/fees": [], "/inspections": [{ id: "insp-1", processId: "proc-1", type: "VISTORIA", scheduledAt: "2026-08-03T10:00:00.000Z", latitude: -3.9, longitude: -42.9, report: "Vistoria técnica agendada.", fiscalName: "Juliana Pereira", status: inspectionValidated ? "VALIDADA" : "AGENDADA", validatedAt: inspectionValidated ? "2026-07-30T10:00:00.000Z" : null, validatedBy: inspectionValidated ? "Ana Silva" : null, validationNotes: inspectionValidated ? "Fiscalização concluída sem irregularidades." : null, attachments: [] }], "/document-templates": [], "/institutional/content": [], "/institutional/news": [], "/notifications": [], "/admin/users": [], "/admin/audit": [{ id: "audit-1", createdAt: "2026-07-30T10:00:00.000Z", user: { name: "Ana Silva" }, action: "LOGIN", entity: "Sessao", entityId: "user-1" }],
      "/dashboard": {
        metrics: { total: 1, emAnalise: 1, aguardando: 0, deferidos: 0, indeferidos: 0, emitidas: 0, vencendo: 0, vencidas: 0 },
        groups: { status: [{ name: "EM_ANALISE", count: 1 }], analyst: [{ name: "Ana Silva", count: 1 }], activity: [{ name: "Atividade", count: 1 }], month: [{ name: "2026-07", count: 1 }] },
        deadlines: [],
        processos: [{ ...process, enterprise: { name: "Unidade Ambiental" } }]
      },
      "/settings": { agency: "Secretaria Municipal de Meio Ambiente e Turismo", municipality: "Buriti - MA", analysisDeadlineDays: 30, expirationAlertDays: 45, maxUploadMb: 10, publicSearchEnabled: true },
      "/public/news": [],
      "/public/processes": [{ number: "2026.000001", enterprise: "Unidade Ambiental", licenseType: "LUA", status: "Em análise" }],
      "/public/licenses/CODIGO-VALIDO-1234": { number: "LIC-001", type: "LUA", issuedAt: "2026-07-01", validUntil: "2027-07-01", signedBy: "Secretária", process: "2026.000001", protocol: "BURITI-2026-000001", enterprise: "Unidade Ambiental", entrepreneur: "Empresa Buriti", status: "Licença emitida", signatureValid: true, downloadAvailable: false }
    };
    const key = url.pathname === "/public/processes" ? "/public/processes" : url.pathname;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(bodies[key] ?? {}) });
  });
}

async function openMenuOnMobile(page: Page) {
  if ((page.viewportSize()?.width ?? 1000) <= 860) await page.getByRole("button", { name: "Abrir menu" }).click();
}

test("login, navegação, processo e saída", async ({ page }) => {
  await mockApi(page); await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Entrar no sistema" })).toBeVisible();
  await page.getByLabel("E-mail", { exact: true }).fill("ana@buriti.ma.gov.br"); await page.getByLabel("Senha", { exact: true }).fill("senha-segura"); await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/dashboard/); await openMenuOnMobile(page); await page.getByRole("link", { name: "Processos" }).click(); await page.getByRole("button", { name: "2026.000001" }).click();
  await expect(page.getByRole("dialog")).toContainText("BURITI-2026-000001"); await page.getByRole("button", { name: "Fechar", exact: true }).click(); await page.getByRole("button", { name: "Sair" }).click(); await expect(page).toHaveURL(/login/);
});

test("menu respeita perfil fiscal", async ({ page }) => {
  await mockApi(page, "FISCAL"); await page.goto("/login"); await page.getByLabel("E-mail", { exact: true }).fill("fiscal@buriti.ma.gov.br"); await page.getByLabel("Senha", { exact: true }).fill("senha-segura"); await page.getByRole("button", { name: "Entrar" }).click();
  await openMenuOnMobile(page); await expect(page.getByRole("link", { name: "Fiscalização" })).toBeVisible(); await expect(page.getByRole("link", { name: "Usuários" })).toHaveCount(0); await page.goto("/usuarios"); await expect(page).toHaveURL(/403/);
});

test("empreendedor pode solicitar e editar os próprios cadastros", async ({ page }) => {
  await mockApi(page, "EMPREENDEDOR");
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill("empresa@example.test");
  await page.getByLabel("Senha", { exact: true }).fill("senha-segura");
  await page.getByRole("button", { name: "Entrar" }).click();

  await page.goto("/processos");
  await expect(page.getByRole("button", { name: "Nova solicitação" })).toBeVisible();
  await page.goto("/empreendimentos");
  await expect(page.getByRole("button", { name: "Editar" })).toBeVisible();
  await page.goto("/responsaveis");
  await expect(page.getByRole("button", { name: "Editar" })).toBeVisible();

  await page.goto("/modelos");
  await expect(page).toHaveURL(/403/);
  await page.goto("/conteudos");
  await expect(page).toHaveURL(/403/);
});

test("consulta pública e validação", async ({ page }) => {
  await mockApi(page); await page.goto("/consulta"); await page.getByLabel("Termo de consulta").fill("2026.000001"); await expect(page.getByText("Unidade Ambiental")).toBeVisible();
  await page.goto("/validar-documento"); await page.getByLabel("Código de validação").fill("CODIGO-VALIDO-1234"); await page.getByRole("button", { name: "Validar" }).click(); await expect(page.getByText("Documento válido")).toBeVisible();
});

test("layout não causa overflow horizontal", async ({ page }) => {
  await page.goto("/login"); const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth); expect(overflow).toBe(false);
});

test("ações exibem retorno ao concluir, baixar sem arquivo e exportar vazio", async ({ page }) => {
  await mockApi(page);
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill("ana@buriti.ma.gov.br");
  await page.getByLabel("Senha", { exact: true }).fill("senha-segura");
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page.getByText("Acesso ao sistema")).toBeVisible();

  await page.goto("/responsaveis");
  await page.getByRole("button", { name: "Baixar" }).click();
  await expect(page.getByRole("status")).toContainText("Nenhuma ART está disponível");

  await page.goto("/fiscalizacao");
  await page.getByRole("button", { name: "Concluir" }).click();
  await expect(page.getByRole("dialog")).toContainText("Concluir fiscalização");
  await page.getByLabel("Conclusão").fill("Fiscalização concluída sem irregularidades.");
  await page.getByRole("button", { name: "Confirmar conclusão" }).click();
  await expect(page.getByRole("status")).toContainText("Fiscalização concluída");
  await expect(page.getByText("Validada")).toBeVisible();

  await page.goto("/relatorios");
  await page.getByLabel("Bairro / localidade").fill("localidade inexistente");
  await page.getByRole("button", { name: "Exportar CSV" }).click();
  await expect(page.getByRole("status")).toContainText("Não há processos no filtro atual");
});

test("aviso de documento ausente desaparece da lateral", async ({ page }) => {
  await mockApi(page);
  await page.goto("/login");
  await page.getByLabel("E-mail", { exact: true }).fill("ana@buriti.ma.gov.br");
  await page.getByLabel("Senha", { exact: true }).fill("senha-segura");
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.goto("/processos/proc-1");
  await page.getByRole("tab", { name: "Documentos", exact: true }).click();
  await page.getByRole("button", { name: "Baixar", exact: true }).click();
  const drawerError = page.locator(".detail-content .field-error");
  await expect(drawerError).toContainText("Arquivo não encontrado");
  await expect(drawerError).toBeHidden({ timeout: 7000 });
});
