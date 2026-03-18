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
    var submissionsSheet = getOrCreateSheet_(ss, "Submissions", [
      "timestamp", "submissionId", "aoName", "projectName", "location", "structure",
      "lampCount", "totalAreaSqm", "totalModules", "moduleCost", "fabricCost", "structureCost",
      "scaffoldCost", "subtotalBeforeGP", "estimatedPrice", "templateFileUrl", "templateFileStatus",
      "templateFileName", "pricingSource", "rawPricingSummary"
    ]);
    var lampsSheet = getOrCreateSheet_(ss, "LampItems", [
      "timestamp", "submissionId", "itemIndex", "shapeName", "objectShape", "w_m", "l_m", "qty",
      "height_m", "depth", "fabric", "light", "moduleCountPerLamp", "totalModulesPerType",
      "exactAreaPerLampSqm", "totalAreaPerTypeSqm", "lampFileUrl", "lampFileStatus", "lampFileName"
    ]);
    var filesSheet = getOrCreateSheet_(ss, "Files", [
      "timestamp", "submissionId", "scope", "itemIndex", "shapeName", "fileName", "mimeType",
      "sizeBytes", "status", "fileUrl", "error"
    ]);

    var folderId = "1chyuDE1Ib8hrRX42Q_T-q6SRM4Muk2YF";
    var folder = DriveApp.getFolderById(folderId);

    var timestamp = new Date();
    var submissionId = Utilities.getUuid();
    var lamps = data.lamps || [];
    var lampsText = "";

    var totalAreaFromLamps = 0;
    var totalModulesFromLamps = 0;

    // Upload template drawing แยกจากไฟล์โคมเสมอ
    var templateUpload = uploadBase64File_(
      folder,
      data.templateFile,
      (data.projectName || "template") + "_Drawing.pdf"
    );

    filesSheet.appendRow([
      timestamp,
      submissionId,
      "TEMPLATE",
      "",
      "",
      templateUpload.fileName,
      templateUpload.mimeType,
      templateUpload.sizeBytes,
      templateUpload.status,
      templateUpload.url,
      templateUpload.error
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
        "LAMP",
        i + 1,
        lamp.shapeName || "",
        lampUpload.fileName,
        lampUpload.mimeType,
        lampUpload.sizeBytes,
        lampUpload.status,
        lampUpload.url,
        lampUpload.error
      ]);

      lampsSheet.appendRow([
        timestamp,
        submissionId,
        i + 1,
        lamp.shapeName || "",
        lamp.objectShape || "",
        lamp.w || "",
        lamp.l || "",
        qty,
        lamp.h || "",
        lamp.d || "",
        lamp.f || "",
        lamp.t || "",
        modulesPerLamp,
        totalLampModules,
        area,
        totalLampArea,
        lampUpload.url,
        lampUpload.status,
        lampUpload.fileName
      ]);

      lampsText += "🔸 Shape: " + (lamp.shapeName || "-") + " (" + qty + " โคม)\n" +
        "✅ พื้นที่จริงต่อโคม: " + area.toFixed(2) + " ตรม.\n" +
        "รวมพื้นที่ Type นี้: " + totalLampArea.toFixed(2) + " ตรม.\n" +
        "จำนวนโมดูลรวม Type นี้: " + totalLampModules + " ชิ้น\n" +
        "- สูง: " + (lamp.h || "-") + " ม. | ลึก: " + (lamp.d || "-") + "\n" +
        "- ผ้าใบ: " + (lamp.f || "-") + " | แสง: " + (lamp.t || "-") + "\n" +
        "- ไฟล์โคม: " + lampUpload.url + "\n\n";
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
      moduleCost,
      fabricCost,
      structureCost,
      scaffoldCost,
      subtotalBeforeGP,
      estimatedPrice,
      templateUpload.url,
      templateUpload.status,
      templateUpload.fileName,
      hasPricingSummary ? "frontend-pricingSummary" : "fallback-from-lamps",
      JSON.stringify(pricing)
    ]);

    var formattedPrice = estimatedPrice.toLocaleString("th-TH", { style: "currency", currency: "THB" });
    var formattedArea = finalArea.toFixed(2);
    var formattedModules = finalModules.toLocaleString("th-TH");
    var formattedSubtotal = subtotalBeforeGP.toLocaleString("th-TH", { style: "currency", currency: "THB" });

    var message =
      "📋 มีการประเมินราคาหน้างานใหม่ (คำนวณพื้นที่จริง)\n\n" +
      "🆔 Submission: " + submissionId + "\n" +
      "👤 AO/แผนก: " + (data.aoName || "-") + "\n" +
      "🏢 Project: " + (data.projectName || "-") + "\n" +
      "📍 สถานที่: " + (data.location || "-") + "\n" +
      "🏗️ โครงสร้างส่วนกลาง: " + (data.structure || "-") + "\n" +
      "📄 Template Drawing: " + templateUpload.url + "\n" +
      "------------------------\n" +
      "📝 รายละเอียดโคมแยกตาม Type:\n\n" + lampsText +
      "------------------------\n" +
      "📌 สรุปพื้นที่รวม (Exact Area): " + formattedArea + " ตรม.\n" +
      "🔢 Module รวม: " + formattedModules + " ชิ้น\n" +
      "🧮 ต้นทุนก่อน GP: " + formattedSubtotal + "\n" +
      "💰 ประเมินราคาเบื้องต้น: " + formattedPrice;

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
