/**
 * System Log Analysis
 * Computes thesis metrics from complaint lifecycle data + structured audit logs:
 * - AI accuracy (routing / category vs final values and overrides)
 * - Complaint processing time (submit → milestones)
 * - Resolution performance (completion, returns, citizen validation)
 */

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function officesMatch(left, right) {
  const a = normalizeText(left);
  const b = normalizeText(right);
  if (!a || !b) return false;
  if (a === b) return true;
  return a.includes(b) || b.includes(a);
}

function categoriesMatch(left, right) {
  const a = normalizeText(left);
  const b = normalizeText(right);
  return Boolean(a && b && a === b);
}

function toMs(value) {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function hoursBetween(startValue, endValue) {
  const start = toMs(startValue);
  const end = toMs(endValue);
  if (start == null || end == null || end < start) return null;
  return (end - start) / (1000 * 60 * 60);
}

function average(values = []) {
  if (!values.length) return null;
  const sum = values.reduce((total, value) => total + value, 0);
  return sum / values.length;
}

function median(values = []) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function roundMetric(value, digits = 1) {
  if (value == null || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function formatHours(value) {
  if (value == null || !Number.isFinite(value)) return "—";
  if (value < 1) {
    const minutes = Math.round(value * 60);
    return `${minutes}m`;
  }
  if (value < 48) {
    return `${roundMetric(value, 1)}h`;
  }
  return `${roundMetric(value / 24, 1)}d`;
}

function formatPercent(value) {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${Math.round(value)}%`;
}

/**
 * Map a complaints row (or analytics-mapped complaint) into analysis fields.
 */
export function normalizeComplaintForSystemLogAnalysis(row = {}) {
  const createdAt =
    row.createdAt ||
    row.created_at ||
    row.submitted_at ||
    row.submittedAt ||
    null;

  return {
    id: row.id || row.rawId || null,
    status: String(row.status || "").trim(),
    category: row.category || row.concern_category || null,
    assignedOffice:
      row.assignedOffice ||
      row.assigned_office ||
      row.department ||
      null,
    aiCategory: row.aiCategory || row.ai_category || null,
    aiAssignedOffice: row.aiAssignedOffice || row.ai_assigned_office || null,
    aiConfidence:
      row.aiConfidence ??
      row.ai_confidence ??
      null,
    createdAt,
    routedAt: row.routedAt || row.routed_at || null,
    inProgressAt: row.inProgressAt || row.in_progress_at || null,
    forValidationAt: row.forValidationAt || row.for_validation_at || null,
    completedAt: row.completedAt || row.completed_at || null,
    returnedAt: row.returnedAt || row.returned_at || null,
    citizenValidationAnswer:
      row.citizenValidationAnswer ||
      row.citizen_validation_answer ||
      row.validation_answer ||
      null,
    reassignedFromOffice:
      row.reassignedFromOffice || row.reassigned_from_office || null,
    reassignedToOffice:
      row.reassignedToOffice || row.reassigned_to_office || null,
    reassignedAt: row.reassignedAt || row.reassigned_at || null,
  };
}

function buildAiAccuracy(complaints = [], auditLogs = []) {
  let comparable = 0;
  let officeCorrect = 0;
  let categoryCorrect = 0;
  let highConfidenceTotal = 0;
  let highConfidenceCorrect = 0;

  complaints.forEach((complaint) => {
    const aiOffice = complaint.aiAssignedOffice;
    const finalOffice = complaint.assignedOffice;
    const aiCategory = complaint.aiCategory;
    const finalCategory = complaint.category;

    const hasOfficePair = Boolean(aiOffice && finalOffice);
    const hasCategoryPair = Boolean(aiCategory && finalCategory);

    if (!hasOfficePair && !hasCategoryPair) return;

    comparable += 1;

    const officeOk = hasOfficePair ? officesMatch(aiOffice, finalOffice) : true;
    const categoryOk = hasCategoryPair
      ? categoriesMatch(aiCategory, finalCategory)
      : true;

    if (hasOfficePair && officeOk) officeCorrect += 1;
    if (hasCategoryPair && categoryOk) categoryCorrect += 1;

    const confidence = Number(complaint.aiConfidence);
    if (Number.isFinite(confidence) && confidence >= 0.7) {
      highConfidenceTotal += 1;
      if (officeOk && categoryOk) highConfidenceCorrect += 1;
    }
  });

  const overrideFromComplaints = complaints.filter((item) =>
    Boolean(item.reassignedAt || item.reassignedFromOffice)
  ).length;

  const overrideLogs = (auditLogs || []).filter((log) => {
    const action = normalizeText(log?.action);
    return (
      action === "complaint_reassign" ||
      action === "ai_routing_override" ||
      action.includes("reassign")
    );
  });

  const analyzedWithAi = complaints.filter(
    (item) => item.aiAssignedOffice || item.aiCategory
  ).length;

  let officePairs = 0;
  let categoryPairs = 0;

  complaints.forEach((complaint) => {
    if (complaint.aiAssignedOffice && complaint.assignedOffice) officePairs += 1;
    if (complaint.aiCategory && complaint.category) categoryPairs += 1;
  });

  const routingAccuracy =
    officePairs > 0 ? (officeCorrect / officePairs) * 100 : null;
  const categoryAccuracy =
    categoryPairs > 0 ? (categoryCorrect / categoryPairs) * 100 : null;

  // Overall = average of available office/category accuracies.
  const accuracyParts = [routingAccuracy, categoryAccuracy].filter(
    (value) => value != null
  );
  const overall =
    accuracyParts.length > 0
      ? accuracyParts.reduce((sum, value) => sum + value, 0) /
        accuracyParts.length
      : null;

  return {
    analyzedComplaints: analyzedWithAi,
    comparableComplaints: comparable,
    routingAccuracy: roundMetric(routingAccuracy, 1),
    categoryAccuracy: roundMetric(categoryAccuracy, 1),
    overallAccuracy: roundMetric(overall, 1),
    overrideCount: Math.max(overrideFromComplaints, overrideLogs.length),
    highConfidenceAccuracy:
      highConfidenceTotal > 0
        ? roundMetric((highConfidenceCorrect / highConfidenceTotal) * 100, 1)
        : null,
    highConfidenceSample: highConfidenceTotal,
  };
}

function buildProcessingTime(complaints = []) {
  const toInProgress = [];
  const toValidation = [];
  const toCompleted = [];

  complaints.forEach((complaint) => {
    const start = complaint.createdAt;
    const inProgressHours = hoursBetween(start, complaint.inProgressAt);
    const validationHours = hoursBetween(start, complaint.forValidationAt);
    const completedHours = hoursBetween(start, complaint.completedAt);

    if (inProgressHours != null) toInProgress.push(inProgressHours);
    if (validationHours != null) toValidation.push(validationHours);
    if (completedHours != null) toCompleted.push(completedHours);
  });

  return {
    sampleInProgress: toInProgress.length,
    sampleValidation: toValidation.length,
    sampleCompleted: toCompleted.length,
    avgSubmitToInProgressHours: roundMetric(average(toInProgress), 2),
    medianSubmitToInProgressHours: roundMetric(median(toInProgress), 2),
    avgSubmitToValidationHours: roundMetric(average(toValidation), 2),
    medianSubmitToValidationHours: roundMetric(median(toValidation), 2),
    avgSubmitToCompletedHours: roundMetric(average(toCompleted), 2),
    medianSubmitToCompletedHours: roundMetric(median(toCompleted), 2),
  };
}

function buildResolutionPerformance(complaints = []) {
  const total = complaints.length;
  let completed = 0;
  let inProgress = 0;
  let forValidation = 0;
  let returned = 0;
  let validated = 0;
  let validationResolved = 0;

  complaints.forEach((complaint) => {
    const status = normalizeText(complaint.status);

    if (status === "completed" || status === "resolved" || status === "closed") {
      completed += 1;
    } else if (status === "in progress" || status === "in_progress") {
      inProgress += 1;
    } else if (status === "for validation" || status === "validated") {
      forValidation += 1;
    } else if (status === "returned" || status === "unsolved") {
      returned += 1;
    }

    if (complaint.returnedAt) {
      returned += status === "returned" || status === "unsolved" ? 0 : 1;
    }

    const answer = normalizeText(complaint.citizenValidationAnswer);
    if (answer) {
      validated += 1;
      if (answer === "resolved" || answer === "yes") {
        validationResolved += 1;
      }
    }
  });

  // Avoid double-counting returns: recount from returnedAt / status uniquely.
  returned = complaints.filter((complaint) => {
    const status = normalizeText(complaint.status);
    return (
      status === "returned" ||
      status === "unsolved" ||
      Boolean(complaint.returnedAt)
    );
  }).length;

  const completionRate = total > 0 ? (completed / total) * 100 : null;
  const returnRate = total > 0 ? (returned / total) * 100 : null;
  const validationPassRate =
    validated > 0 ? (validationResolved / validated) * 100 : null;

  return {
    totalComplaints: total,
    completedCount: completed,
    inProgressCount: inProgress,
    forValidationCount: forValidation,
    returnedCount: returned,
    validatedCount: validated,
    validationResolvedCount: validationResolved,
    completionRate: roundMetric(completionRate, 1),
    returnRate: roundMetric(returnRate, 1),
    validationPassRate: roundMetric(validationPassRate, 1),
  };
}

export function buildSystemLogAnalysis({
  complaints = [],
  auditLogs = [],
} = {}) {
  const normalizedComplaints = complaints.map(
    normalizeComplaintForSystemLogAnalysis
  );

  const aiAccuracy = buildAiAccuracy(normalizedComplaints, auditLogs);
  const processingTime = buildProcessingTime(normalizedComplaints);
  const resolutionPerformance = buildResolutionPerformance(normalizedComplaints);

  return {
    generatedAt: new Date().toISOString(),
    sampleSize: normalizedComplaints.length,
    aiAccuracy,
    processingTime,
    resolutionPerformance,
    labels: {
      avgSubmitToCompleted: formatHours(
        processingTime.avgSubmitToCompletedHours
      ),
      medianSubmitToCompleted: formatHours(
        processingTime.medianSubmitToCompletedHours
      ),
      avgSubmitToInProgress: formatHours(
        processingTime.avgSubmitToInProgressHours
      ),
      avgSubmitToValidation: formatHours(
        processingTime.avgSubmitToValidationHours
      ),
      routingAccuracy: formatPercent(aiAccuracy.routingAccuracy),
      categoryAccuracy: formatPercent(aiAccuracy.categoryAccuracy),
      overallAccuracy: formatPercent(aiAccuracy.overallAccuracy),
      completionRate: formatPercent(resolutionPerformance.completionRate),
      returnRate: formatPercent(resolutionPerformance.returnRate),
      validationPassRate: formatPercent(
        resolutionPerformance.validationPassRate
      ),
    },
  };
}

export { formatHours, formatPercent };
