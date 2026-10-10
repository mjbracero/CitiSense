// ===== [BACKUP SERVER] Excel-friendly CSV exports (readable without database tools) =====
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";

const manila = (column) =>
  `to_char(${column} at time zone 'Asia/Manila', 'YYYY-MM-DD HH24:MI')`;

export const CSV_EXPORTS = {
  "complaints.csv": `
    select
      coalesce(c.short_id, c.id::text) as "Complaint No.",
      ${manila("c.created_at")} as "Date Submitted",
      c.title as "Title",
      c.description as "Description",
      c.category as "Category",
      c.assigned_office as "Assigned Office(s)",
      c.status as "Overall Status",
      (
        select string_agg(s.office || ': ' || s.status, ' | ' order by s.created_at, s.office)
        from public.complaint_office_status s
        where s.complaint_id = c.id
      ) as "Status per Department",
      c.priority as "Priority",
      case when c.is_emergency then 'Yes' else 'No' end as "Emergency",
      p.full_name as "Citizen Name",
      c.contact_number as "Contact Number",
      p.barangay as "Barangay",
      c.location_text as "Location",
      c.latitude as "Latitude",
      c.longitude as "Longitude",
      ${manila("c.in_progress_at")} as "In Progress At",
      ${manila("c.for_validation_at")} as "For Validation At",
      ${manila("c.completed_at")} as "Completed At",
      ${manila("c.returned_at")} as "Returned At",
      c.citizen_validation_answer as "Citizen Validation",
      c.citizen_validation_feedback as "Citizen Feedback",
      case when jsonb_typeof(c.photo_urls) = 'array'
        then (select string_agg(url, ' ') from jsonb_array_elements_text(c.photo_urls) url)
      end as "Photo Files (storage/complaint-photos)",
      c.id as "System ID"
    from public.complaints c
    left join public.profiles p on p.id = c.citizen_id
    order by c.created_at desc`,

  "department_status.csv": `
    select
      coalesce(c.short_id, c.id::text) as "Complaint No.",
      c.title as "Title",
      s.office as "Department",
      s.status as "Department Status",
      ${manila("s.updated_at")} as "Last Updated",
      c.status as "Overall Status",
      c.id as "System ID"
    from public.complaint_office_status s
    join public.complaints c on c.id = s.complaint_id
    order by c.created_at desc, s.created_at, s.office`,

  "users.csv": `
    select
      p.full_name as "Full Name",
      p.email as "Email",
      p.role as "Role",
      p.department as "Department",
      p.barangay as "Barangay",
      p.contact_number as "Contact Number",
      ${manila("p.created_at")} as "Registered",
      case when p.banned_at is not null then 'Yes' else 'No' end as "Banned",
      p.id as "System ID"
    from public.profiles p
    order by p.role, p.full_name`,
};

function exportCsv(sql, outputFile) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "psql",
      [
        config.databaseUrl,
        "-X",
        "-q",
        "-v",
        "ON_ERROR_STOP=1",
        "-o",
        outputFile,
        "-c",
        `COPY (${sql}) TO STDOUT WITH (FORMAT csv, HEADER)`,
      ],
      { stdio: ["ignore", "ignore", "pipe"] }
    );
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`psql exited with ${code}: ${stderr.trim().slice(-500)}`));
    });
  });
}

function countCsvRecords(content) {
  let records = 0;
  let inQuotes = false;
  let lineHasData = false;
  for (const char of content) {
    if (char === '"') inQuotes = !inQuotes;
    if (char === "\n" && !inQuotes) {
      if (lineHasData) records += 1;
      lineHasData = false;
    } else if (char !== "\r") {
      lineHasData = true;
    }
  }
  return lineHasData ? records + 1 : records;
}

// Writes the CSVs into <workDir>/excel. A failed export is reported but never
// fails the backup, because the database dump is the copy used for recovery.
export async function writeCsvExports(workDir) {
  const dir = path.join(workDir, "excel");
  await fs.mkdir(dir, { recursive: true });
  const result = {};

  for (const [fileName, sql] of Object.entries(CSV_EXPORTS)) {
    const file = path.join(dir, fileName);
    try {
      await exportCsv(sql, file);
      const content = await fs.readFile(file, "utf8");
      // BOM so Excel reads accents (ñ, é) correctly.
      await fs.writeFile(file, `\uFEFF${content}`, "utf8");
      result[fileName] = { rows: Math.max(0, countCsvRecords(content) - 1) };
    } catch (error) {
      result[fileName] = { error: String(error?.message || error).slice(0, 300) };
      console.error(`CSV export ${fileName} failed:`, error?.message);
    }
  }

  return result;
}
