import re
import shutil

FILE = "roads.html"
BACKUP = "roads_backup.html"

# 1. Create backup
shutil.copy(FILE, BACKUP)
print(f"✅ Backup created: {BACKUP}")

with open(FILE, "r", encoding="utf-8") as f:
    content = f.read()

# 2. Inject STATE only if not exists
if "window.formState" not in content:
    state_block = """
// ===== GLOBAL STATE =====
window.formState = {
  plan: null,
  vehicle: {},
  driver: {}
};

function logState() {
  console.log("[STATE]", JSON.stringify(window.formState, null, 2));
}
"""
    content = content.replace("'use strict';", "'use strict';\n" + state_block)
    print("✅ State injected")
else:
    print("⚠️ State already exists — skipped")

# 3. Fix submitAndProceed flow
if "populateReview();" not in content:
    content = re.sub(
        r"(\/\/ Step C: Move to payment UI)",
        "populateReview();\npopulateStep2Summary();\n\\1",
        content
    )
    print("✅ Flow fix injected")
else:
    print("⚠️ Flow fix already present")

# 4. Add plan_id validation
if "Please select a plan." not in content:
    content = content.replace(
        "var plan_id = selectedPlanId;",
        """
if (!selectedPlanId) {
  showApiError('Please select a plan.');
  return false;
}
var plan_id = selectedPlanId;
"""
    )
    print("✅ plan_id validation added")
else:
    print("⚠️ plan_id validation already exists")

# 5. Save file
with open(FILE, "w", encoding="utf-8") as f:
    f.write(content)

print("🚀 Patch applied successfully")