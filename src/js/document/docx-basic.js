import { createZipBlob } from "../image/zip.js";

function xml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;",
  })[char]);
}

function paragraph(text) {
  const runs = String(text || "").split("\n").map((line) =>
    `<w:r><w:t xml:space="preserve">${xml(line)}</w:t></w:r>`
  ).join("<w:r><w:br/></w:r>");
  return `<w:p>${runs}</w:p>`;
}

function pageBreak() {
  return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
}

function imageParagraph(image, index) {
  const width = Math.round(image.cx);
  const height = Math.round(image.cy);
  return `
  <w:p>
    <w:r>
      <w:drawing>
        <wp:inline distT="0" distB="0" distL="0" distR="0">
          <wp:extent cx="${width}" cy="${height}"/>
          <wp:docPr id="${index + 1}" name="Pagina ${index + 1}"/>
          <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
            <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
              <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
                <pic:nvPicPr><pic:cNvPr id="${index + 1}" name="${xml(image.name)}"/><pic:cNvPicPr/></pic:nvPicPr>
                <pic:blipFill><a:blip r:embed="rId${index + 1}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>
                <pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${width}" cy="${height}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>
              </pic:pic>
            </a:graphicData>
          </a:graphic>
        </wp:inline>
      </w:drawing>
    </w:r>
  </w:p>`;
}

function documentXml(body) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
  xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">
  <w:body>
    ${body}
    <w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720"/></w:sectPr>
  </w:body>
</w:document>`;
}

function contentTypes(hasImages) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  ${hasImages ? '<Default Extension="png" ContentType="image/png"/>' : ""}
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;
}

function rootRels() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;
}

function documentRels(images) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${images.map((image, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${xml(image.name)}"/>`).join("")}
</Relationships>`;
}

export async function createTextDocxBlob(pages) {
  const body = pages.map((page, index) => `${paragraph(page || "")}${index < pages.length - 1 ? pageBreak() : ""}`).join("");
  return createZipBlob([
    { name: "[Content_Types].xml", blob: new Blob([contentTypes(false)], { type: "application/xml" }) },
    { name: "_rels/.rels", blob: new Blob([rootRels()], { type: "application/xml" }) },
    { name: "word/document.xml", blob: new Blob([documentXml(body)], { type: "application/xml" }) },
    { name: "word/_rels/document.xml.rels", blob: new Blob([documentRels([])], { type: "application/xml" }) },
  ]);
}

export async function createImageDocxBlob(images) {
  const maxCx = 5943600;
  const normalized = images.map((image, index) => {
    const ratio = image.height ? image.width / image.height : 0.75;
    const cx = maxCx;
    const cy = Math.round(maxCx / Math.max(0.1, ratio));
    return { ...image, name: `page-${index + 1}.png`, cx, cy };
  });
  const body = normalized.map((image, index) => `${imageParagraph(image, index)}${index < normalized.length - 1 ? pageBreak() : ""}`).join("");
  const entries = [
    { name: "[Content_Types].xml", blob: new Blob([contentTypes(true)], { type: "application/xml" }) },
    { name: "_rels/.rels", blob: new Blob([rootRels()], { type: "application/xml" }) },
    { name: "word/document.xml", blob: new Blob([documentXml(body)], { type: "application/xml" }) },
    { name: "word/_rels/document.xml.rels", blob: new Blob([documentRels(normalized)], { type: "application/xml" }) },
  ];
  normalized.forEach((image) => entries.push({ name: `word/media/${image.name}`, blob: image.blob }));
  return createZipBlob(entries);
}
