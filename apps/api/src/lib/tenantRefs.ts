import { prisma } from "./prisma.js";
import { BusinessRuleError } from "../domain/rules.js";

export async function assertTenantReferences(organizationId: string, branchId?: string, departmentId?: string): Promise<void> {
  if (branchId) {
    const branch = await prisma.branch.findFirst({ where: { id: branchId, organizationId, isActive: true } });
    if (!branch) throw new BusinessRuleError("Selected branch is not available in this organization.");
  }
  if (departmentId) {
    const department = await prisma.department.findFirst({ where: { id: departmentId, organizationId, isActive: true } });
    if (!department) throw new BusinessRuleError("Selected department is not available in this organization.");
    if (branchId && department.branchId && department.branchId !== branchId) throw new BusinessRuleError("Selected department does not belong to the selected branch.");
  }
}
