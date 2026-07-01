#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");

const files = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === ".git") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(jsx?|tsx?)$/.test(entry.name)) files.push(full);
  }
}
walk(root);

const replacements = [
  [/\(tabs\)\/citizen/dashboard/g, "citizen/dashboard"],
  [/\(tabs\)\/citizen/submit/g, "citizen/submit"],
  [/\(tabs\)\/citizen/notification/g, "citizen/notification"],
  [/\(tabs\)\/departmentHead/notification/g, "departmentHead/notification"],
  [/\/citizen/dashboard\b/g, "/citizen/dashboard"],
  [/\/citizen/submit\b/g, "/citizen/submit"],
  [/\/citizen/complaints\b/g, "/citizen/complaints"],
  [/\/citizen/profile\b/g, "/citizen/profile"],
  [/\/citizen/notification\b/g, "/citizen/notification"],
  [/\/citizen/editComplaintLocation\b/g, "/citizen/citizen/editComplaintLocation"],
  [/\/departmentHead/dashboard\b/g, "/departmentHead/dashboard"],
  [/\/departmentHead/assignedComplaints\b/g, "/departmentHead/assignedComplaints"],
  [/\/departmentHead/profile\b/g, "/departmentHead/profile"],
  [/\/departmentHead/notification\b/g, "/departmentHead/notification"],
  [/\/admin/dashboard\b/g, "/admin/dashboard"],
  [/\/admin/complaints\b/g, "/admin/complaints"],
  [/\/admin/profile\b/g, "/admin/profile"],
  [/\/admin/notification\b/g, "/admin/notification"],
  [/\/admin/manageUsers\b/g, "/admin/manageUsers"],
  [/\/admin/analytics\b/g, "/admin/analytics"],
  [/\/admin/aiAnalysisResult\b/g, "/admin/admin/aiAnalysisResult"],
  [/\/auth/forgotPassword\b/g, "/auth/auth/forgotPassword"],
  [/\/auth/resetPassword\b/g, "/auth/auth/resetPassword"],
  [/(?<![\w])\/auth/signup\b/g, "/auth/signup"],
  [/(?<![\w])\/auth/login\b/g, "/auth/login"],
  ["activePath: \"citizenDashboard\"", 'activePath: "citizen/dashboard"'],
  ["activePath: \"moderatorDashboard\"", 'activePath: "departmentHead/dashboard"'],
  ["activePath: \"moderatorAssignedComplaints\"", 'activePath: "departmentHead/assignedComplaints"'],
  ["activePath: \"moderatorNotification\"", 'activePath: "departmentHead/notification"'],
  ["activePath: \"moderatorProfile\"", 'activePath: "departmentHead/profile"'],
  ['includes("citizen/dashboard")', 'includes("citizen/dashboard")'],
  ['includes("departmentHead/dashboard")', 'includes("departmentHead/dashboard")'],
  ['includes("departmentHead/profile")', 'includes("departmentHead/profile")'],
  ['includes("admin/dashboard")', 'includes("admin/dashboard")'],
  ["../../lib/departmentHeadNotificationService", "../../lib/departmentHeadNotificationService"],
  ["../lib/departmentHeadNotificationService", "../lib/departmentHeadNotificationService"],
  ["../../hooks/useDepartmentHeadUnreadNotifications", "../../hooks/useDepartmentHeadUnreadNotifications"],
  ["../../hooks/useAdminUnreadNotifications", "../../hooks/useAdminUnreadNotifications"],
  ["notifyDepartmentHeadsNewAssignment", "notifyDepartmentHeadsNewAssignment"],
  ["notifyDepartmentHeadsReassigned", "notifyDepartmentHeadsReassigned"],
  ["useDepartmentHeadUnreadNotifications", "useDepartmentHeadUnreadNotifications"],
  ["departmentHeadNotificationService", "departmentHeadNotificationService"],
  ['role: "departmentHead"', 'role: "departmentHead"'],
  ['data.role === "departmentHead"', 'data.role === "departmentHead"'],
  ["DepartmentHeadNotification", "DepartmentHeadNotification"],
  ["DepartmentHeadProfile", "DepartmentHeadProfile"],
  ["DepartmentHeadAssignedComplaints", "DepartmentHeadAssignedComplaints"],
  ["DepartmentHeadDashboard", "DepartmentHeadDashboard"],
  ["DEFAULT_DEPARTMENT_HEAD_DEPARTMENT", "DEFAULT_DEPARTMENT_HEAD_DEPARTMENT"],
  ["departmentHeadDepartment", "departmentHeadDepartment"],
  ["setDepartmentHeadDepartment", "setDepartmentHeadDepartment"],
  ["loadDepartmentHeadDepartment", "loadDepartmentHeadDepartment"],
  ["currentDepartmentHeadId", "currentDepartmentHeadId"],
  ["setCurrentDepartmentHeadId", "setCurrentDepartmentHeadId"],
  ["cachedDepartmentHeadId", "cachedDepartmentHeadId"],
  ["getCurrentDepartmentHeadId", "getCurrentDepartmentHeadId"],
  ["excludeDepartmentHeadId", "excludeDepartmentHeadId"],
  ["createDepartmentHeadNotificationAndPush", "createDepartmentHeadNotificationAndPush"],
  ["notifyDepartmentHeadsInDepartment", "notifyDepartmentHeadsInDepartment"],
  ["getDepartmentHeadIdsByDepartment", "getDepartmentHeadIdsByDepartment"],
  ["Department Head", "Department Head"],
  ["department head", "department head"],
  ["Department Head User", "Department Head User"],
  ["departmenthead@example.com", "departmenthead@example.com"],
  ["Department Head Location", "Department Head Location"],
  ["Department head location", "Department head location"],
  ["department head location", "department head location"],
  ["Department Head Location Needed", "Department Head Location Needed"],
  ["your department head", "your department head"],
  ["Your department head", "Your department head"],
  ["department head information", "department head information"],
  ["department head accounts", "department head accounts"],
  ["department head update policy", "department head update policy"],
  ["by the department head", "by the department head"],
  ["Load department head", "Load department head"],
  ["Department head unread", "Department head unread"],
  ["Department head profile", "Department head profile"],
  ["Department head assigned", "Department head assigned"],
  ["Department head notifications", "Department head notifications"],
  ["Setup department head", "Setup department head"],
  ["Refresh department head", "Refresh department head"],
  ["Remove department head", "Remove department head"],
  ["Mark department head", "Mark department head"],
  ["label: \"Moderator\"", 'label: "Department Head"'],
  ['id: "departmentHead"', 'id: "departmentHead"'],
  ["profile.role === \"moderator\"", 'profile.role === "moderator" || profile.role === "departmentHead" || profile.role === "departmentHead"'],
  ['cleanRole === "moderator" || cleanRole === "departmentHead"', 'cleanRole === "moderator" || cleanRole === "departmentHead"'],
  ["returned to department head", "returned to department head"],
  ['role: "moderator", // stored role in profiles', 'role: "moderator", // stored role in profiles'],
];

for (const file of files) {
  if (file.includes(`${path.sep}app${path.sep}(tabs)${path.sep}`)) continue;
  let content = fs.readFileSync(file, "utf8");
  let next = content;
  for (const [from, to] of replacements) {
    next = next.replace(from, to);
  }
  if (next !== content) fs.writeFileSync(file, next);
}

console.log("Refactor replacements applied.");
