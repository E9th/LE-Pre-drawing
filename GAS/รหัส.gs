function doPost(e) {
  try { 
    // แปลงข้อมูล JSON ที่ส่งมาจาก React
    var data = JSON.parse(e.postData.contents);
    
    var token = "1SHmvfWgLkqNFZYHoN0uCAmWWE7thyUJ9teVGEG9Xq54FgFuyGeJiWftqe6Z1+D7i5jwzbWSgbo+33URCSK1PZJXHfhD9IXxCv3lkaai6CbIXveC7gk/z7M6OGE0Ba/Nn8CGsASCY9Ft6vnFC3jBKgdB04t89/1O/w1cDnyilFU="; 
    var adminUserId = "C1999182f542981df93a07216fedb0147";
    
    var sheetId = "1MfbQTqNbsIkKe7l8BClj1YEkjb9aZO6oVCETqffYmhg"; 
    var sheet = SpreadsheetApp.openById(sheetId).getSheets()[0];

    var folderId = "1chyuDE1Ib8hrRX42Q_T-q6SRM4Muk2YF"; 
    var folder = DriveApp.getFolderById(folderId);
    
    var totalArea = 0;
    var lampsText = "";
    var timestamp = new Date();
    
    // วนลูปข้อมูลโคมที่ส่งมา
    for (var i = 0; i < data.lamps.length; i++) {
      var lamp = data.lamps[i];
      var area = parseFloat(lamp.exactArea); 
      var totalLampArea = area * parseInt(lamp.q);
      totalArea += totalLampArea;
      
      var fileUrl = "-";
      if (lamp.file && lamp.file.data) {
        try {
          var splitData = lamp.file.data.split(",");
          var base64Data = splitData[1] || splitData[0];
          var blob = Utilities.newBlob(Utilities.base64Decode(base64Data), lamp.file.mimeType, data.projectName + "_" + lamp.shapeName + "_Drawing.pdf");
          var newFile = folder.createFile(blob);
          fileUrl = newFile.getUrl(); 
          try { newFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch(shareErr) {}
        } catch(err) {
          fileUrl = "(อัปโหลดไฟล์ไม่สำเร็จ)";
        }
      }

      // บันทึกลง Sheet
      sheet.appendRow([
        timestamp, data.aoName, data.projectName, data.location, data.structure,
        lamp.shapeName, lamp.w, lamp.l, lamp.q, lamp.h, lamp.d, lamp.f, lamp.t, fileUrl, area
      ]);

      // ข้อความ LINE
      lampsText += "🔸 Shape: " + lamp.shapeName + " (" + lamp.q + " โคม)\n" +
                   "✅ พื้นที่จริงต่อโคม: " + area.toFixed(2) + " ตรม.\n" +
                   "รวมพื้นที่ Type นี้: " + totalLampArea.toFixed(2) + " ตรม.\n" +
                   "- สูง: " + lamp.h + " ม. | ลึก: " + lamp.d + "\n" +
                   "- ผ้าใบ: " + lamp.f + " | แสง: " + lamp.t + "\n" +
                   "- ไฟล์ Drawing: " + fileUrl + "\n\n";
    }

    // คำนวณ BOQ
    var pricePerSqm = 8000; 
    var basePrice = totalArea * pricePerSqm;
    var structureCost = (data.structure === "ทำ") ? (totalArea * 1500) : 0; 
    var estimatedPrice = basePrice + structureCost;

    var formattedPrice = estimatedPrice.toLocaleString('th-TH', { style: 'currency', currency: 'THB' });
    var formattedArea = totalArea.toFixed(2);

    var message = "📋 มีการประเมินราคาหน้างานใหม่ (คำนวณพื้นที่จริง)\n\n" +
                  "👤 AO/แผนก: " + data.aoName + "\n" +
                  "🏢 Project: " + data.projectName + "\n" +
                  "📍 สถานที่: " + data.location + "\n" +
                  "🏗️ โครงสร้างส่วนกลาง: " + data.structure + "\n" +
                  "------------------------\n" +
                  "📝 รายละเอียดโคมแยกตาม Type:\n\n" + lampsText +
                  "------------------------\n" +
                  "📌 สรุปพื้นที่รวม (Exact Area): " + formattedArea + " ตรม.\n" +
                  "💰 ประเมินราคาเบื้องต้น: " + formattedPrice;

    var url = "https://api.line.me/v2/bot/message/push";
    UrlFetchApp.fetch(url, {
      "method": "post",
      "headers": { "Content-Type": "application/json", "Authorization": "Bearer " + token },
      "payload": JSON.stringify({ "to": adminUserId, "messages": [{"type": "text", "text": message}] })
    });

    // 🌟 ส่งคำตอบกลับไปหาเว็บ React (ลบตัวปัญหาออกแล้ว)
    return ContentService.createTextOutput(JSON.stringify({status: "Success"}))
                         .setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    // 🌟 ส่ง Error กลับไปหาเว็บ React (ลบตัวปัญหาออกแล้ว)
    return ContentService.createTextOutput(JSON.stringify({status: "Error", message: error.message}))
                         .setMimeType(ContentService.MimeType.JSON);
  }
}
