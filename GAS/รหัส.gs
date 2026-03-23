function getOrCreateSheet_(ss, name, headers) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
  }
  return sheet;
}

function toNumber_(value, fallback) {
  var n = Number(value);
  return isFinite(n) ? n : fallback;
}

function uploadBase64File_(folder, fileObj, fallbackName) {
  if (!fileObj || !fileObj.data) {
    return {
      ok: false,
      status: "NO_FILE",
      url: "-",
      fileName: fallbackName,
      mimeType: fileObj && fileObj.mimeType ? fileObj.mimeType : "application/octet-stream",
      sizeBytes: 0,
      error: "",
    };
  }

  try {
    var splitData = String(fileObj.data).split(",");
    var base64Data = splitData.length > 1 ? splitData[1] : splitData[0];
    var bytes = Utilities.base64Decode(base64Data);
    var mimeType = fileObj.mimeType || "application/octet-stream";
    var fileName = fileObj.name || fallbackName;
    var blob = Utilities.newBlob(bytes, mimeType, fileName);
    var newFile = folder.createFile(blob);
    try {
      newFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (shareErr) {}
    return {
      ok: true,
      status: "UPLOADED",
      url: newFile.getUrl(),
      fileName: fileName,
      mimeType: mimeType,
      sizeBytes: bytes.length,
      error: "",
    };
  } catch (err) {
    return {
      ok: false,
      status: "ERROR",
      url: "(อัปโหลดไฟล์ไม่สำเร็จ)",
      fileName: fileObj.name || fallbackName,
      mimeType: fileObj.mimeType || "application/octet-stream",
      sizeBytes: 0,
      error: err && err.message ? err.message : String(err),
    };
  }
}

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents || "{}");

    var token = "1SHmvfWgLkqNFZYHoN0uCAmWWE7thyUJ9teVGEG9Xq54FgFuyGeJiWftqe6Z1+D7i5jwzbWSgbo+33URCSK1PZJXHfhD9IXxCv3lkaai6CbIXveC7gk/z7M6OGE0Ba/Nn8CGsASCY9Ft6vnFC3jBKgdB04t89/1O/w1cDnyilFU=";
    var adminUserId = "C1999182f542981df93a07216fedb0147";

    var sheetId = "1MfbQTqNbsIkKe7l8BClj1YEkjb9aZO6oVCETqffYmhg";
    var ss = SpreadsheetApp.openById(sheetId);
    var submissionsSheet = getOrCreateSheet_(ss, "สรุปรายการ", [
      "วันเวลา",
      "รหัสรายการ",
      "AO/แผนก",
      "โครงการ",
      "สถานที่",
      "โครงสร้างส่วนกลาง",
      "จำนวนประเภทโคม",
      "พื้นที่รวม (ตร.ม.)",
      "Module รวม (ชิ้น)",
      "ค่าผ้าใบ (บาท)",
      "ค่าโครงสร้าง (บาท)",
      "ค่านั่งร้าน (บาท)",
      "ค่าจำนวน Module (บาท)",
      "ต้นทุนก่อน GP (บาท)",
      "ราคาประเมิน /0.7 (บาท)",
      "ไฟล์ Template",
      "สถานะไฟล์ Template",
      "ไฟล์ CSV",
      "สถานะไฟล์ CSV"
    ]);
    var lampsSheet = getOrCreateSheet_(ss, "รายละเอียดแต่ละโคม", [
      "วันเวลา",
      "รหัสรายการ",
      "ลำดับ",
      "ชื่อ Type",
      "รูปทรง",
      "กว้าง (มม.)",
      "ยาว (มม.)",
      "จำนวนโคม",
      "สูงหน้างาน (ม.)",
      "ความลึกโครง",
      "ชนิดผ้า",
      "อุณหภูมิแสง",
      "Module ต่อโคม (ชิ้น)",
      "Module รวม Type นี้ (ชิ้น)",
      "พื้นที่ต่อโคม (ตร.ม.)",
      "พื้นที่รวม Type นี้ (ตร.ม.)",
      "ค่าผ้าใบ Type นี้ (บาท)",
      "ค่าโครงสร้าง Type นี้ (บาท)",
      "ค่านั่งร้าน Type นี้ (บาท)",
      "ค่า Module Type นี้ (บาท)",
      "ต้นทุนก่อน GP Type นี้ (บาท)",
      "ราคาประเมิน /0.7 Type นี้ (บาท)",
      "ไฟล์โคม",
      "สถานะไฟล์โคม"
    ]);
    var filesSheet = getOrCreateSheet_(ss, "ไฟล์แนบ", [
      "วันเวลา",
      "รหัสรายการ",
      "ประเภทไฟล์",
      "ลำดับโคม",
      "ชื่อ Type",
      "ชื่อไฟล์",
      "ชนิดไฟล์",
      "ขนาดไฟล์ (bytes)",
      "สถานะ",
      "ลิงก์ไฟล์",
      "หมายเหตุ"
    ]);

    var folderId = "1chyuDE1Ib8hrRX42Q_T-q6SRM4Muk2YF";
    var folder = DriveApp.getFolderById(folderId);

    var timestamp = new Date();
    var submissionId = Utilities.getUuid();
    var lamps = data.lamps || [];
    var lampDetails = [];
    var lampsText = "";

    var totalAreaFromLamps = 0;
    var totalModulesFromLamps = 0;

    // Upload template drawing แยกจากไฟล์โคมเสมอ
    var templateUpload = uploadBase64File_(
      folder,
      data.templateFile,
      (data.projectName || "template") + "_Drawing.pdf"
    );

    var csvUpload = uploadBase64File_(
      folder,
      data.csvFile,
      (data.projectName || "pricing") + "_Pricing_Report.csv"
    );

    filesSheet.appendRow([
      timestamp,
      submissionId,
      "Template Drawing",
      "",
      "",
      templateUpload.fileName,
      templateUpload.mimeType,
      templateUpload.sizeBytes,
      templateUpload.status,
      templateUpload.url,
      templateUpload.error
    ]);

    filesSheet.appendRow([
      timestamp,
      submissionId,
      "Pricing CSV",
      "",
      "",
      csvUpload.fileName,
      csvUpload.mimeType,
      csvUpload.sizeBytes,
      csvUpload.status,
      csvUpload.url,
      csvUpload.error
    ]);

    for (var i = 0; i < lamps.length; i++) {
      var lamp = lamps[i] || {};
      var area = Math.max(0, toNumber_(lamp.exactArea, 0));
      var qty = Math.max(0, Math.floor(toNumber_(lamp.q, 0)));
      var modulesPerLamp = Math.max(1, Math.floor(toNumber_(lamp.moduleCount, 1)));
      var totalLampArea = area * qty;
      var totalLampModules = modulesPerLamp * qty;

      totalAreaFromLamps += totalLampArea;
      totalModulesFromLamps += totalLampModules;

      var lampUpload = uploadBase64File_(
        folder,
        lamp.file,
        (data.projectName || "project") + "_" + (lamp.shapeName || ("lamp_" + (i + 1)))
      );

      filesSheet.appendRow([
        timestamp,
        submissionId,
        "โคม",
        i + 1,
        lamp.shapeName || "",
        lampUpload.fileName,
        lampUpload.mimeType,
        lampUpload.sizeBytes,
        lampUpload.status,
        lampUpload.url,
        lampUpload.error
      ]);

      lampDetails.push({
        index: i + 1,
        shapeName: lamp.shapeName || "-",
        objectShape: lamp.objectShape || "",
        widthM: lamp.w || "",
        lengthM: lamp.l || "",
        qty: qty,
        h: lamp.h || "",
        d: lamp.d || "",
        f: lamp.f || "",
        t: lamp.t || "",
        areaPerLamp: area,
        totalAreaPerType: totalLampArea,
        modulesPerLamp: modulesPerLamp,
        totalModulesPerType: totalLampModules,
        lampUpload: lampUpload,
      });
    }

    var pricing = data.pricingSummary || {};
    var hasPricingSummary =
      isFinite(Number(pricing.totalAreaSqm)) &&
      isFinite(Number(pricing.totalModules)) &&
      isFinite(Number(pricing.subtotalBeforeGP)) &&
      isFinite(Number(pricing.estimatedPrice));

    var finalArea = hasPricingSummary ? Number(pricing.totalAreaSqm) : totalAreaFromLamps;
    var finalModules = hasPricingSummary ? Number(pricing.totalModules) : totalModulesFromLamps;
    var moduleCost = hasPricingSummary ? Number(pricing.moduleCost || 0) : finalModules * 21;
    var fabricCost = hasPricingSummary ? Number(pricing.fabricCost || 0) : 0;
    var structureCost = hasPricingSummary ? Number(pricing.structureCost || 0) : 0;
    var scaffoldCost = hasPricingSummary ? Number(pricing.scaffoldCost || 0) : 0;
    var subtotalBeforeGP = hasPricingSummary ? Number(pricing.subtotalBeforeGP) : moduleCost + fabricCost + structureCost + scaffoldCost;
    var estimatedPrice = hasPricingSummary ? Number(pricing.estimatedPrice) : subtotalBeforeGP;

    // กระจายราคาไปแต่ละ Type ตามสัดส่วนพื้นที่ (ส่วน module ใช้จำนวนจริงต่อ Type)
    var areaDenominator = finalArea > 0 ? finalArea : 1;
    for (var j = 0; j < lampDetails.length; j++) {
      var item = lampDetails[j];
      var areaRatio = item.totalAreaPerType / areaDenominator;
      var fabricPerType = fabricCost * areaRatio;
      var structurePerType = structureCost * areaRatio;
      var scaffoldPerType = scaffoldCost * areaRatio;
      var modulePerType = item.totalModulesPerType * 21;
      var subtotalPerType = fabricPerType + structurePerType + scaffoldPerType + modulePerType;
      var estimatePerType = subtotalPerType / 0.7;

      lampsSheet.appendRow([
        timestamp,
        submissionId,
        item.index,
        item.shapeName,
        item.objectShape,
        item.widthM,
        item.lengthM,
        item.qty,
        item.h,
        item.d,
        item.f,
        item.t,
        item.modulesPerLamp,
        item.totalModulesPerType,
        item.areaPerLamp,
        item.totalAreaPerType,
        Math.round(fabricPerType * 100) / 100,
        Math.round(structurePerType * 100) / 100,
        Math.round(scaffoldPerType * 100) / 100,
        Math.round(modulePerType * 100) / 100,
        Math.round(subtotalPerType * 100) / 100,
        Math.round(estimatePerType * 100) / 100,
        item.lampUpload.url,
        item.lampUpload.status
      ]);

      lampsText +=
        j + 1 + ") " + item.shapeName + " | " + item.qty + " โคม\n" +
        "   พื้นที่รวม: " + item.totalAreaPerType.toFixed(2) + " ตร.ม. | Module: " + item.totalModulesPerType + " ชิ้น\n" +
        "   ต้นทุนก่อน GP: " + subtotalPerType.toLocaleString("th-TH", { style: "currency", currency: "THB" }) + "\n" +
        "   ราคาประเมิน /0.7: " + estimatePerType.toLocaleString("th-TH", { style: "currency", currency: "THB" }) + "\n" +
        "   สูง " + item.h + " ม. | ลึก " + item.d + " | ผ้า " + item.f + " | แสง " + item.t + "\n" +
        "   ไฟล์โคม: " + item.lampUpload.url + "\n\n";
    }

    submissionsSheet.appendRow([
      timestamp,
      submissionId,
      data.aoName || "",
      data.projectName || "",
      data.location || "",
      data.structure || "",
      lamps.length,
      finalArea,
      finalModules,
      fabricCost,
      structureCost,
      scaffoldCost,
      moduleCost,
      subtotalBeforeGP,
      estimatedPrice,
      templateUpload.url,
      templateUpload.status,
      csvUpload.url,
      csvUpload.status
    ]);

    var formattedPrice = estimatedPrice.toLocaleString("th-TH", { style: "currency", currency: "THB" });
    var formattedArea = finalArea.toFixed(2);
    var formattedModules = finalModules.toLocaleString("th-TH");
    var formattedSubtotal = subtotalBeforeGP.toLocaleString("th-TH", { style: "currency", currency: "THB" });

    var message =
      "📋 สรุปประเมินราคาหน้างาน\n" +
      "────────────────\n" +
      "🆔 รหัสรายการ: " + submissionId + "\n" +
      "👤 AO/แผนก: " + (data.aoName || "-") + "\n" +
      "🏢 Project: " + (data.projectName || "-") + "\n" +
      "📍 สถานที่: " + (data.location || "-") + "\n" +
      "🏗️ โครงสร้างส่วนกลาง: " + (data.structure || "-") + "\n" +
      "📄 Template Drawing: " + templateUpload.url + "\n" +
      "🧾 Pricing CSV: " + csvUpload.url + "\n" +
      "────────────────\n" +
      "📌 สรุปรวม\n" +
      "• พื้นที่รวม: " + formattedArea + " ตร.ม.\n" +
      "• Module รวม: " + formattedModules + " ชิ้น\n" +
      "• ต้นทุนก่อน GP: " + formattedSubtotal + "\n" +
      "• ราคาประเมิน /0.7: " + formattedPrice + "\n" +
      "────────────────\n" +
      "📝 แยกตาม Type\n\n" + lampsText;

    var url = "https://api.line.me/v2/bot/message/push";
    UrlFetchApp.fetch(url, {
      method: "post",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      payload: JSON.stringify({
        to: adminUserId,
        messages: [{ type: "text", text: message }],
      }),
    });

    return ContentService.createTextOutput(JSON.stringify({ status: "Success", submissionId: submissionId }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ status: "Error", message: error.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
