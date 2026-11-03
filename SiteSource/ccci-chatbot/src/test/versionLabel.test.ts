import { describe, it, expect } from "vitest";
import { versionLabel } from "@/components/SiteFooter";

describe("versionLabel", () => {
  it("produção: o número do estágio antes da versão do software, sem o nome", () => {
    expect(versionLabel("prod", "2", "1.27")).toBe("v2.1.27");
  });
  it("dev: o nome do estágio e a versão do software", () => {
    expect(versionLabel("dev", null, "1.27")).toBe("dev · v1.27");
  });
  it("outro estágio com número: o nome e os três números", () => {
    expect(versionLabel("test", "3", "1.27")).toBe("test · v3.1.27");
  });
  it("sem resposta da API: só a versão do software", () => {
    expect(versionLabel(null, null, "1.27")).toBe("v1.27");
  });
});
