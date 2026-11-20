import { jsPDF } from "jspdf";
import { fmt, type Forecast, type Meta } from "@/lib/api";

const COLORS = {
  ink: [7, 12, 24] as const,
  panel: [16, 25, 43] as const,
  line: [40, 52, 72] as const,
  text: [235, 241, 250] as const,
  muted: [143, 157, 179] as const,
  accent: [255, 122, 69] as const,
  mint: [43, 212, 164] as const,
};

function setTextColor(pdf: jsPDF, color: readonly number[]) {
  pdf.setTextColor(color[0], color[1], color[2]);
}

function setDrawColor(pdf: jsPDF, color: readonly number[]) {
  pdf.setDrawColor(color[0], color[1], color[2]);
}

function setFillColor(pdf: jsPDF, color: readonly number[]) {
  pdf.setFillColor(color[0], color[1], color[2]);
}

function drawHourlyChart(pdf: jsPDF, forecast: Forecast, x: number, y: number, width: number, height: number) {
  const plotX = x + 12;
  const plotY = y + 18;
  const plotWidth = width - 18;
  const plotHeight = height - 29;
  const max = Math.max(1, ...forecast.hours.map((hour) => hour.upper_80));
  const xAt = (index: number) => plotX + (plotWidth * index) / Math.max(1, forecast.hours.length - 1);
  const yAt = (value: number) => plotY + plotHeight - (value / max) * plotHeight;

  pdf.setFontSize(7);
  setTextColor(pdf, COLORS.muted);
  for (let step = 0; step <= 3; step++) {
    const value = (max * step) / 3;
    const lineY = yAt(value);
    setDrawColor(pdf, COLORS.line);
    pdf.setLineWidth(0.2);
    pdf.line(plotX, lineY, plotX + plotWidth, lineY);
    pdf.text(String(Math.round(value)), plotX - 2, lineY + 1, { align: "right" });
  }

  setDrawColor(pdf, COLORS.accent);
  pdf.setLineWidth(0.9);
  forecast.hours.forEach((hour, index) => {
    pdf.line(xAt(index), yAt(hour.lower_80), xAt(index), yAt(hour.upper_80));
    if (index > 0) {
      pdf.line(xAt(index - 1), yAt(forecast.hours[index - 1].forecast), xAt(index), yAt(hour.forecast));
    }
  });

  setDrawColor(pdf, COLORS.muted);
  pdf.setLineWidth(0.45);
  pdf.setLineDashPattern([1.2, 1.2], 0);
  forecast.hours.forEach((hour, index) => {
    if (index > 0) {
      pdf.line(xAt(index - 1), yAt(forecast.hours[index - 1].typical), xAt(index), yAt(hour.typical));
    }
  });
  pdf.setLineDashPattern([], 0);

  pdf.setFontSize(6.5);
  [0, 6, 12, 18, 23].filter((index) => index < forecast.hours.length).forEach((index) => {
    pdf.text(fmt.hour(forecast.hours[index].hour), xAt(index), plotY + plotHeight + 5, { align: "center" });
  });
}

function drawHourlyTable(pdf: jsPDF, x: number, y: number, width: number, hours: Forecast["hours"]) {
  const columns = [
    { label: "HOUR", width: 25, value: (hour: Forecast["hours"][number]) => hour.time },
    { label: "TRIPS", width: 23, value: (hour: Forecast["hours"][number]) => fmt.one(hour.forecast) },
    { label: "80% RANGE", width: 31, value: (hour: Forecast["hours"][number]) => `${Math.round(hour.lower_80)}-${Math.round(hour.upper_80)}` },
    { label: "DRIVERS", width: 25, value: (hour: Forecast["hours"][number]) => String(hour.drivers) },
    { label: "SAFE", width: 22, value: (hour: Forecast["hours"][number]) => String(hour.drivers_safe) },
  ];
  const rowHeight = 3.35;

  setFillColor(pdf, COLORS.panel);
  pdf.rect(x, y, width, rowHeight + 1, "F");
  setTextColor(pdf, COLORS.muted);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(5.8);
  let columnX = x + 2;
  for (const column of columns) {
    pdf.text(column.label, columnX + (column.width - 3), y + 2.4, { align: "right" });
    columnX += column.width;
  }

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(6.7);
  hours.forEach((hour, index) => {
    const rowY = y + rowHeight + 1 + index * rowHeight;
    if (index % 2 === 1) {
      setFillColor(pdf, [11, 18, 32]);
      pdf.rect(x, rowY, width, rowHeight, "F");
    }
    let cellX = x + 2;
    for (const column of columns) {
      setTextColor(pdf, column.label === "SAFE" ? COLORS.mint : COLORS.text);
      pdf.text(column.value(hour), cellX + column.width - 3, rowY + 2.35, { align: "right" });
      cellX += column.width;
    }
  });
}

export function exportForecastPdf(forecast: Forecast, meta: Meta, zone: string) {
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const margin = 14;

  setFillColor(pdf, COLORS.ink);
  pdf.rect(0, 0, pageWidth, 210, "F");
  setFillColor(pdf, COLORS.accent);
  pdf.rect(0, 0, 3, 32, "F");

  setTextColor(pdf, COLORS.accent);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.text("ADDIS RIDE  /  OPERATIONS", margin, 10);
  setTextColor(pdf, COLORS.text);
  pdf.setFontSize(19);
  pdf.text("Daily demand forecast", margin, 19);
  setTextColor(pdf, COLORS.muted);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.text(`${zone}  |  ${fmt.day(forecast.date).long}`, margin, 26);
  pdf.setFontSize(7);
  pdf.text(`${meta.model.name}  |  Validation RMSE ${meta.model.rmse} trips per zone-hour`, pageWidth - margin, 11, { align: "right" });

  const kpis = [
    { label: "EXPECTED TRIPS", value: fmt.int(forecast.kpis.total) },
    { label: "PEAK DEMAND", value: `${forecast.kpis.peak_hour}  /  ${fmt.one(forecast.kpis.peak_trips)} trips` },
    { label: "PEAK DRIVERS", value: fmt.int(forecast.kpis.peak_drivers) },
    { label: "GROSS FARE ESTIMATE", value: `${fmt.int(forecast.kpis.gross_fares)} birr` },
  ];
  const cardY = 37;
  const gap = 4;
  const cardWidth = (pageWidth - margin * 2 - gap * (kpis.length - 1)) / kpis.length;
  kpis.forEach((kpi, index) => {
    const x = margin + index * (cardWidth + gap);
    setFillColor(pdf, COLORS.panel);
    pdf.roundedRect(x, cardY, cardWidth, 23, 2, 2, "F");
    setTextColor(pdf, COLORS.muted);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(6.5);
    pdf.text(kpi.label, x + 4, cardY + 7);
    setTextColor(pdf, COLORS.text);
    pdf.setFontSize(12);
    pdf.text(kpi.value, x + 4, cardY + 17);
  });

  const chartX = margin;
  const chartY = 65;
  const chartWidth = 177;
  const detailX = chartX + chartWidth + gap;
  const detailWidth = pageWidth - margin - detailX;
  const panelHeight = 69;
  setFillColor(pdf, COLORS.panel);
  pdf.roundedRect(chartX, chartY, chartWidth, panelHeight, 2, 2, "F");
  pdf.roundedRect(detailX, chartY, detailWidth, panelHeight, 2, 2, "F");

  setTextColor(pdf, COLORS.text);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.text("Hourly demand", chartX + 5, chartY + 7);
  setTextColor(pdf, COLORS.accent);
  pdf.setFontSize(6);
  pdf.text("Forecast", chartX + 105, chartY + 7);
  setTextColor(pdf, COLORS.muted);
  pdf.text("80% range", chartX + 128, chartY + 7);
  pdf.setDrawColor(COLORS.accent[0], COLORS.accent[1], COLORS.accent[2]);
  pdf.line(chartX + 98, chartY + 6, chartX + 102, chartY + 6);
  pdf.setDrawColor(COLORS.muted[0], COLORS.muted[1], COLORS.muted[2]);
  pdf.line(chartX + 122, chartY + 4, chartX + 122, chartY + 8);
  drawHourlyChart(pdf, forecast, chartX, chartY, chartWidth, panelHeight);

  setTextColor(pdf, COLORS.text);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.text("Conditions & planning", detailX + 5, chartY + 7);
  setTextColor(pdf, COLORS.muted);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7);
  const peakNote = `Peak range: ${Math.round(forecast.kpis.peak_range[0])}-${Math.round(forecast.kpis.peak_range[1])} trips`;
  pdf.text(peakNote, detailX + 5, chartY + 15);
  pdf.text(`Typical daily demand: ${fmt.int(forecast.kpis.usual_total)} trips`, detailX + 5, chartY + 21);
  let noteY = chartY + 29;
  const notes = forecast.lookup.chips.filter((chip) => chip.kind !== "none");
  for (const note of notes.slice(0, 4)) {
    const label = note.kind === "event" ? "Event" : "Weather";
    const lines = pdf.splitTextToSize(`${label}: ${note.text}`, detailWidth - 10) as string[];
    for (const line of lines.slice(0, 2)) {
      if (noteY > chartY + panelHeight - 4) break;
      pdf.text(line, detailX + 5, noteY);
      noteY += 4;
    }
    if (noteY > chartY + panelHeight - 4) break;
  }
  if (!notes.length) {
    pdf.text("No listed weather or event notes.", detailX + 5, noteY);
  }

  setTextColor(pdf, COLORS.text);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7.5);
  pdf.text(`Hourly staffing plan  /  ${zone}`, margin, 142);
  const tableY = 146;
  const tableWidth = (pageWidth - margin * 2 - gap) / 2;
  drawHourlyTable(pdf, margin, tableY, tableWidth, forecast.hours.slice(0, 12));
  drawHourlyTable(pdf, margin + tableWidth + gap, tableY, tableWidth, forecast.hours.slice(12));

  setDrawColor(pdf, COLORS.line);
  pdf.line(margin, 200, pageWidth - margin, 200);
  setTextColor(pdf, COLORS.muted);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(6.5);
  pdf.text("Planning estimate only. Forecasts are not live trip counts. SAFE staffing uses the upper 80% demand estimate.", margin, 205);
  pdf.text(`Team ${meta.team}`, pageWidth - margin, 205, { align: "right" });

  const slug = zone.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  pdf.save(`addis-ride-${slug}-${forecast.date}.pdf`);
}
