import { expect, test, type Page } from "@playwright/test";

const process = { id: "proc-1", number: "2026.000001", protocol: "BURITI-2026-000001", entrepreneurId: "emp-1", enterpriseId: "end-1", analyst: { name: "Ana Silva" }, licenseType: "LUA", status: "EM_ANALISE", openedAt: "2026-07-01T10:00:00.000Z", dueDate: "2026-08-01T10:00:00.000Z", documents: [], messages: [], history: [], issuedDocs: [], conditions: [] };

async function mockApi(page: Page, role = "ADMIN") {
  await page.route("http://localhost:3333/**", async (route) => {
    const url = new URL(route.request().url());
    const bodies: Record<string, unknown> = {
      "/auth/login": { token: "test-token", user: { id: "user-1", name: "Ana Silva", email: "ana@buriti.ma.gov.br", role } },
      "/processes": [process],
      "/entrepreneurs": [{ id: "emp-1", personType: "PJ", name: "Empresa Buriti", cnpj: "12345678000190", legalRepresentative: "Ana", phone: "98999999999", email: "empresa@example.test", address: "Buriti/MA" }],
      "/technical-managers": [],
      "/enterprises": [{ id: "end-1", entrepreneurId: "emp-1", name: "Unidade Ambiental", address: "Centro", municipality: "Buriti - MA", latitude: -3.9, longitude: -42.9, activityId: "act-1", areaHectares: 1, size: "Médio", pollutionLevel: "Médio", propertyClass: "Urbano" }],
      "/catalog/activities": [{ id: "act-1", code: "01", description: "Atividade", size: "Médio", pollutionLevel: "Médio", requiredLicenses: ["LUA"], requiredDocuments: ["Requerimento"] }],
      "/catalog/fees": [], "/inspections": [], "/document-templates": [], "/institutional/content": [], "/institutional/news": [], "/notifications": [], "/admin/users": [], "/admin/audit": [],
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

test("consulta pública e validação", async ({ page }) => {
  await mockApi(page); await page.goto("/consulta"); await page.getByLabel("Termo de consulta").fill("2026.000001"); await expect(page.getByText("Unidade Ambiental")).toBeVisible();
  await page.goto("/validar-documento"); await page.getByLabel("Código de validação").fill("CODIGO-VALIDO-1234"); await page.getByRole("button", { name: "Validar" }).click(); await expect(page.getByText("Documento válido")).toBeVisible();
});

test("layout não causa overflow horizontal", async ({ page }) => {
  await page.goto("/login"); const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth); expect(overflow).toBe(false);
});
