(() => {
  "use strict";

  const originalWrite = document.write.bind(document);

  function runtime() {
    "use strict";

    const products = (() => {
      try {
        if (typeof PRODUCTS !== "undefined" && Array.isArray(PRODUCTS)) return PRODUCTS;
      } catch {}
      return Array.isArray(window.PRODUCTS) ? window.PRODUCTS : [];
    })();
    if (!products.length) return;

    const audit = window.__FORMA_PACKAGE_DUPLICATE_AUDIT__;
    const replacements = Array.isArray(audit?.replacements) ? audit.replacements : [];
    if (!replacements.length) {
      window.__DUPLICATE_GROUP_CONFLICT_GUARD__ = {
        enabled: true,
        version: 1,
        replacementsFound: 0,
        conflictingDuplicateHostCount: 0
      };
      return;
    }

    const idOf = (product, index = 0) => Number(product?.id) || index + 1;
    const byId = new Map(products.map((product, index) => [idOf(product, index), product]));

    const numericPrice = value => {
      if (typeof value === "number") return value;
      return Number(String(value ?? "").replace(/\s+/g, "").replace(",", "."));
    };

    const priceOf = product => {
      for (const key of ["wholesalePrice", "price", "retailPrice"]) {
        const value = numericPrice(product?.[key]);
        if (Number.isFinite(value) && value >= 0) return value;
      }
      return Number.POSITIVE_INFINITY;
    };

    const normalizeName = value => String(value || "")
      .replace(/\s*[/,(]?\s*\d+\s*шт\.?\s*(?:в\s*)?(?:\d+\s*[-хx]?\s*)?(?:упаковк\w*|уп)\s*[)/,]?/giu, " ")
      .replace(/\s+/g, " ")
      .trim();

    const replacementById = new Map();
    replacements.forEach(item => {
      const hiddenId = Number(item?.hiddenId);
      const keptId = Number(item?.keptId);
      if (!byId.has(hiddenId) || !byId.has(keptId) || hiddenId === keptId) return;
      replacementById.set(hiddenId, keptId);
    });

    const hiddenIds = new Set(replacementById.keys());
    const keptIds = new Set(replacementById.values());
    const currentGroups = (Array.isArray(window.PRODUCT_DUPLICATE_GROUPS)
      ? window.PRODUCT_DUPLICATE_GROUPS
      : []
    ).map(group => ({
      name: group?.name || "Дубли товара",
      ids: [...new Set((group?.ids || []).map(Number).filter(id => byId.has(id)))]
    })).filter(group => group.ids.length > 1);

    const affectedIds = new Set([...hiddenIds, ...keptIds]);
    let expanded = true;
    while (expanded) {
      expanded = false;
      currentGroups.forEach(group => {
        if (!group.ids.some(id => affectedIds.has(id))) return;
        group.ids.forEach(id => {
          if (affectedIds.has(id)) return;
          affectedIds.add(id);
          expanded = true;
        });
      });
    }

    const untouchedGroups = currentGroups.filter(group =>
      !group.ids.some(id => affectedIds.has(id))
    );
    const affectedGroups = currentGroups.filter(group =>
      group.ids.some(id => affectedIds.has(id))
    );

    const parent = new Map();
    const find = id => {
      if (!parent.has(id)) parent.set(id, id);
      const root = parent.get(id);
      if (root !== id) parent.set(id, find(root));
      return parent.get(id);
    };
    const union = (left, right) => {
      const a = find(left);
      const b = find(right);
      if (a !== b) parent.set(b, a);
    };
    const join = ids => {
      const members = [...new Set(ids.map(Number).filter(id => byId.has(id)))];
      if (!members.length) return;
      members.forEach(find);
      for (let index = 1; index < members.length; index += 1) union(members[0], members[index]);
    };

    affectedGroups.forEach(group => join(group.ids));
    replacementById.forEach((keptId, hiddenId) => join([keptId, hiddenId]));

    const components = new Map();
    affectedIds.forEach(id => {
      if (!byId.has(id)) return;
      const root = find(id);
      if (!components.has(root)) components.set(root, new Set());
      components.get(root).add(id);
    });

    const rebuiltGroups = [...components.values()].map(idsSet => {
      const ids = [...idsSet];
      const preferred = ids.filter(id => keptIds.has(id));
      const ordinary = ids.filter(id => !hiddenIds.has(id));
      const hostCandidates = preferred.length ? preferred : (ordinary.length ? ordinary : ids);
      hostCandidates.sort((left, right) =>
        priceOf(byId.get(left)) - priceOf(byId.get(right)) || left - right
      );
      const hostId = hostCandidates[0];
      return {
        name: `${normalizeName(byId.get(hostId)?.name || "Товар")} — объединённые дубли`,
        ids: [hostId, ...ids.filter(id => id !== hostId)]
      };
    }).filter(group => group.ids.length > 1);

    window.PRODUCT_DUPLICATE_GROUPS = [...untouchedGroups, ...rebuiltGroups];

    const replacementId = id => replacementById.get(Number(id)) || Number(id);
    const remapIds = ids => [...new Set((ids || [])
      .map(replacementId)
      .filter(id => byId.has(id)))];

    window.PRODUCT_COLOR_GROUPS = (Array.isArray(window.PRODUCT_COLOR_GROUPS)
      ? window.PRODUCT_COLOR_GROUPS
      : []
    ).map(group => ({ ...group, ids: remapIds(group.ids) }))
      .filter(group => group.ids.length > 0);

    const remapVariantGroup = group => {
      const seen = new Set();
      const variants = [];
      (group?.variants || []).forEach(variant => {
        const id = replacementId(variant.id);
        if (!byId.has(id) || seen.has(id)) return;
        seen.add(id);
        variants.push({ ...variant, id });
      });
      if (!variants.length) return null;
      const mappedPrimary = replacementId(group.primaryId || variants[0].id);
      return {
        ...group,
        primaryId: variants.some(variant => Number(variant.id) === mappedPrimary)
          ? mappedPrimary
          : Number(variants[0].id),
        variants
      };
    };

    window.PRODUCT_EXPLICIT_VARIANT_GROUPS = (Array.isArray(window.PRODUCT_EXPLICIT_VARIANT_GROUPS)
      ? window.PRODUCT_EXPLICIT_VARIANT_GROUPS
      : []
    ).map(remapVariantGroup).filter(Boolean);

    window.PRODUCT_DUAL_VARIANT_GROUPS = (Array.isArray(window.PRODUCT_DUAL_VARIANT_GROUPS)
      ? window.PRODUCT_DUAL_VARIANT_GROUPS
      : []
    ).map(remapVariantGroup).filter(Boolean);

    const hostById = new Map();
    const conflicts = [];
    window.PRODUCT_DUPLICATE_GROUPS.forEach(group => {
      const hostId = Number(group.ids?.[0]);
      (group.ids || []).forEach(value => {
        const id = Number(value);
        if (!Number.isFinite(id)) return;
        const previousHost = hostById.get(id);
        if (previousHost && previousHost !== hostId) conflicts.push({ id, previousHost, hostId });
        else hostById.set(id, hostId);
      });
    });

    window.__DUPLICATE_GROUP_CONFLICT_GUARD__ = {
      enabled: true,
      version: 1,
      replacementsFound: replacementById.size,
      affectedGroupCount: affectedGroups.length,
      rebuiltGroupCount: rebuiltGroups.length,
      conflictingDuplicateHosts: conflicts,
      conflictingDuplicateHostCount: conflicts.length,
      hiddenIdsStillPrimary: [...hiddenIds].filter(id =>
        window.PRODUCT_DUPLICATE_GROUPS.some(group => Number(group.ids?.[0]) === id)
      )
    };

    if (audit && typeof audit === "object") {
      audit.conflictingDuplicateHosts = conflicts;
      audit.conflictingDuplicateHostCount = conflicts.length;
      audit.hiddenIdsStillPrimary = window.__DUPLICATE_GROUP_CONFLICT_GUARD__.hiddenIdsStillPrimary;
      audit.conflictGuardVersion = 1;
    }

    window.dispatchEvent(new CustomEvent("forma:product-groups-ready", {
      detail: { source: "duplicate-group-conflict-guard", conflicts: conflicts.length }
    }));

    const rerender = () => {
      if (typeof window.__FORMA_RENDER_CATALOG__ === "function") window.__FORMA_RENDER_CATALOG__();
    };
    if (typeof queueMicrotask === "function") queueMicrotask(rerender);
    else setTimeout(rerender, 0);
  }

  document.write = function patchedWrite(...parts) {
    let html = parts.join("");
    if (typeof html === "string" && html.includes("</body>")) {
      html = html.replace("</body>", `<script>(${runtime.toString()})();<\/script></body>`);
      return originalWrite(html);
    }
    return originalWrite(...parts);
  };
})();
