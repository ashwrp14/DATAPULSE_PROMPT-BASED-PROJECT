
import { StudentRecord, ResultAnalysis, gradePointMap, passFailColors } from './types';
import { calculateSGPA, calculateCGPA, hasArrears, getSubjectsWithArrears, getGradeColor, formatTo2Decimals } from './gradeUtils';

// Analyze student records and generate comprehensive result analysis
export const analyzeResults = (records: StudentRecord[], assignedSubjects?: string[]): ResultAnalysis => {
  // If assignedSubjects is provided, filter records to only include those subjects
  if (assignedSubjects && assignedSubjects.length > 0) {
    records = records.filter(record => assignedSubjects.includes(record.SCODE));
  }
  
  // Get unique files processed
  const filesProcessed = [...new Set(records.map(record => record.fileSource || 'Unknown'))];
  const fileCount = filesProcessed.length;
  
  // Group records by file source
  const fileGroups: { [fileName: string]: StudentRecord[] } = {};
  filesProcessed.forEach(fileName => {
    fileGroups[fileName] = records.filter(record => record.fileSource === fileName);
  });
  
  // Per-file analysis
  const fileWiseAnalysis: { [fileName: string]: { averageSGPA: number; students: number; semesterName?: string } } = {};
  
  filesProcessed.forEach(fileName => {
    const fileRecords = fileGroups[fileName];
    const fileStudentIds = [...new Set(fileRecords.map(record => record.REGNO))];
    const fileStudentCount = fileStudentIds.length;
    
    // Get the semester name if available (assuming all records in a file have the same semester)
    const semName = fileRecords[0]?.SEM || '';
    
    // Calculate average SGPA for this file, only using explicitly marked current semester subjects if available
    let totalSGPA = 0;
    
    // Check if we have current semester subjects explicitly marked
    const markedCurrentSemesterRecords = fileRecords.filter(record => record.isArrear === true);
    const recordsToUseForSGPA = markedCurrentSemesterRecords.length > 0 
      ? markedCurrentSemesterRecords 
      : fileRecords.filter(record => !record.isArrear);
      
    console.log(`File ${fileName}: Using ${recordsToUseForSGPA.length} records for SGPA calculation`);
    
    fileStudentIds.forEach(studentId => {
      const sgpa = calculateSGPA(recordsToUseForSGPA, studentId);
      totalSGPA += sgpa;
      console.log(`Student ${studentId} in file ${fileName}: SGPA = ${sgpa}`);
    });
    
    const avgSGPA = fileStudentCount > 0 ? formatTo2Decimals(totalSGPA / fileStudentCount) : 0;
    
    fileWiseAnalysis[fileName] = {
      averageSGPA: avgSGPA,
      students: fileStudentCount,
      semesterName: semName || undefined
    };
  });
  
  // Determine the current semester file by finding the file with the highest semester number
  let currentSemesterFile = filesProcessed[0]; // Default to first file
  let highestSemValue = -1;
  
  // If multiple files, find the one with the highest semester number
  if (fileCount > 0) {
    filesProcessed.forEach(fileName => {
      const fileRecords = fileGroups[fileName];
      if (fileRecords.length > 0) {
        // Extract semester value, convert to number for comparison
        const semValue = parseInt(fileRecords[0]?.SEM || '0', 10);
        if (!isNaN(semValue) && semValue > highestSemValue) {
          highestSemValue = semValue;
          currentSemesterFile = fileName;
        }
      }
    });
  }
  
  // Calculate CGPA if multiple files - each file is treated as a separate semester
  let cgpaAnalysis;
  if (fileCount > 1) {
    const studentIds = [...new Set(records.map(record => record.REGNO))];
    
    // Filter out students with zero CGPA to fix the lowest CGPA issue
    const studentCGPAs = studentIds.map(id => {
      const cgpa = calculateCGPA(records, id, fileGroups);
      return {
        id,
        cgpa
      };
    }).filter(student => student.cgpa > 0); // Filter out zero CGPAs
    
    // Sort by CGPA in descending order for toppers list
    studentCGPAs.sort((a, b) => b.cgpa - a.cgpa);
    
    const cgpaValues = studentCGPAs.map(s => s.cgpa);
    
    // Make sure we have valid values
    const validCgpaValues = cgpaValues.filter(val => val > 0);
    
    console.log(`Valid CGPA values for analysis: ${validCgpaValues.length} out of ${cgpaValues.length}`);
    console.log(`CGPA values: ${validCgpaValues.join(', ')}`);
    
    const avgCGPA = validCgpaValues.length > 0 
      ? formatTo2Decimals(validCgpaValues.reduce((sum, cgpa) => sum + cgpa, 0) / validCgpaValues.length) 
      : 0;
      
    const highestCGPA = validCgpaValues.length > 0 
      ? formatTo2Decimals(Math.max(...validCgpaValues)) 
      : 0;
      
    const lowestCGPA = validCgpaValues.length > 0 
      ? formatTo2Decimals(Math.min(...validCgpaValues)) 
      : 0;
    
    cgpaAnalysis = {
      studentCGPAs,
      averageCGPA: avgCGPA,
      highestCGPA: highestCGPA,
      lowestCGPA: lowestCGPA,
      toppersList: studentCGPAs.slice(0, 10), // Get top 10 students
      currentSemesterFile: currentSemesterFile // Use the file with highest sem value as current semester
    };
    
    console.log(`CGPA Analysis - Average: ${avgCGPA}, Highest: ${highestCGPA}, Lowest: ${lowestCGPA}`);
  }
  
  const totalStudents = [...new Set(records.map(record => record.REGNO))].length;
  
  // IMPORTANT FIX: Calculate SGPA specifically for current semester records
  const currentSemesterRecords = currentSemesterFile ? 
    records.filter(record => record.fileSource === currentSemesterFile) : 
    records;
  
  console.log(`Using ${currentSemesterRecords.length} records from "${currentSemesterFile}" for current semester SGPA calculation`);
  
  // Only include records that were explicitly marked as "current semester" by the user
  const currentSemesterOnlyRecords = currentSemesterRecords.filter(record => record.isArrear === true);
  console.log(`Including ${currentSemesterOnlyRecords.length} subjects explicitly marked as current semester for SGPA calculation`);
  
  // If no subjects are marked as current semester, fall back to default behavior
  const nonArrearCurrentSemesterRecords = currentSemesterOnlyRecords.length > 0 ? 
    currentSemesterOnlyRecords : 
    currentSemesterRecords.filter(record => !record.isArrear);
  
  if (currentSemesterOnlyRecords.length === 0) {
    console.log(`No subjects marked as current semester. Falling back to default behavior (excluded ${currentSemesterRecords.length - nonArrearCurrentSemesterRecords.length} arrear subjects)`);
  }
  
  // Calculate SGPA for each student based on current semester only (excluding arrear subjects)
  const studentSgpaMap: { [studentId: string]: number } = {};
  const studentSgpaDetails: { id: string; sgpa: number; hasArrears: boolean }[] = [];
  
  const currentSemStudentIds = [...new Set(nonArrearCurrentSemesterRecords.map(record => record.REGNO))];
  
  // Check if records have credit values
  const recordsWithCredits = currentSemesterRecords.filter(r => r.creditValue && r.creditValue > 0);
  console.log(`Records with credits for SGPA: ${recordsWithCredits.length} out of ${currentSemesterRecords.length}`);
  
  if (recordsWithCredits.length === 0 && currentSemesterRecords.length > 0) {
    console.warn("WARNING: No records have credit values assigned in SGPA calculation! This will result in all SGPAs being 0.");
  }

  currentSemStudentIds.forEach(studentId => {
    const studentRecords = currentSemesterRecords.filter(record => record.REGNO === studentId);
    
    // Manual SGPA calculation for better control and debugging
    let totalPoints = 0;
    let totalCredits = 0;
    
    studentRecords.forEach(record => {
      if (record.GR in gradePointMap) {
        const gradePoint = gradePointMap[record.GR];
        const creditValue = record.creditValue || 0;
        
        if (creditValue > 0) {
          totalPoints += gradePoint * creditValue;
          totalCredits += creditValue;
        }
      }
    });
    
    const sgpa = totalCredits > 0 ? formatTo2Decimals(totalPoints / totalCredits) : 0;
    console.log(`Student ${studentId}: SGPA calculated = ${sgpa}`);
    
    studentSgpaMap[studentId] = sgpa;
    studentSgpaDetails.push({
      id: studentId,
      sgpa: sgpa,
      hasArrears: hasArrears(studentRecords, studentId)
    });
  });
  
  // Sort by registration number
  studentSgpaDetails.sort((a, b) => a.id.localeCompare(b.id));
  
  // Calculate average SGPA, filtering out zero values to fix the incorrect average calculation
  const validSgpaValues = studentSgpaDetails.filter(student => student.sgpa > 0);
  const totalValidStudents = validSgpaValues.length;
  
  const averageCGPA = totalValidStudents > 0 ? 
    formatTo2Decimals(validSgpaValues.reduce((sum, student) => sum + student.sgpa, 0) / totalValidStudents) : 0;
  
  console.log(`Average SGPA calculated: ${averageCGPA} from ${totalValidStudents} valid students out of ${totalStudents} total`);
  console.log(`Valid SGPA values: ${validSgpaValues.map(s => s.sgpa.toFixed(2)).join(', ')}`);
  
  const highestSGPA = studentSgpaDetails.length > 0 ? 
    formatTo2Decimals(Math.max(...studentSgpaDetails.map(student => student.sgpa))) : 0;
  
  const lowestSGPA = studentSgpaDetails.length > 0 ? 
    formatTo2Decimals(Math.min(...studentSgpaDetails.map(student => student.sgpa))) : 0;
  
  // Grade distribution - filter out any non-standard grades
  const gradeDistribution: { [grade: string]: number } = {};
  records.forEach(record => {
    if (record.GR in gradePointMap) {
      gradeDistribution[record.GR] = (gradeDistribution[record.GR] || 0) + 1;
    }
  });
  
  const gradeDistributionData = Object.entries(gradeDistribution).map(([grade, count]) => ({
    name: grade,
    count: count,
    fill: getGradeColor(grade),
  }));
  
  const totalGrades = records.filter(record => record.GR in gradePointMap).length;
  
  // Subject-wise performance - Now includes preservation of subject names
  // For current semester, use only records explicitly marked as current semester
  const currentSemesterMarkedRecords = currentSemesterRecords.filter(record => record.isArrear === true);
  
  // If explicit current semester subjects are marked, use only those
  const recordsForSubjectAnalysis = currentSemesterMarkedRecords.length > 0 ?
    currentSemesterMarkedRecords :
    (currentSemesterFile ? 
      currentSemesterRecords.filter(record => !record.isArrear) : 
      records.filter(record => !record.isArrear));
      
  console.log(`Subject Analysis: Using ${recordsForSubjectAnalysis.length} records out of ${currentSemesterRecords.length} current semester records`);
  
  // Log which subjects are being analyzed
  const subjectsForAnalysis = [...new Set(recordsForSubjectAnalysis.map(record => record.SCODE))];
  console.log(`Subjects included in analysis: ${subjectsForAnalysis.join(', ')}`);
  
  console.log(`Using ${recordsForSubjectAnalysis.length} records for subject performance analysis`);
  
  const subjectPerformanceMap: { [subject: string]: { pass: number; fail: number; total: number; subjectName?: string } } = {};
  recordsForSubjectAnalysis.forEach(record => {
    // Skip records with invalid grades
    if (!(record.GR in gradePointMap)) return;
    
    const subject = record.SCODE;
    if (!subjectPerformanceMap[subject]) {
      subjectPerformanceMap[subject] = { 
        pass: 0, 
        fail: 0, 
        total: 0,
        subjectName: record.subjectName // Store subject name if available
      };
    } else if (record.subjectName && !subjectPerformanceMap[subject].subjectName) {
      // Update subject name if it was previously not set but is now available
      subjectPerformanceMap[subject].subjectName = record.subjectName;
    }
    
    subjectPerformanceMap[subject].total++;
    if (record.GR !== 'U') {
      subjectPerformanceMap[subject].pass++;
    } else {
      subjectPerformanceMap[subject].fail++;
    }
  });
  
  const subjectPerformanceData = Object.entries(subjectPerformanceMap).map(([subject, data]) => ({
    subject: subject,
    pass: data.total > 0 ? formatTo2Decimals((data.pass / data.total) * 100) : 0,
    fail: data.total > 0 ? formatTo2Decimals((data.fail / data.total) * 100) : 0,
    subjectName: data.subjectName // Include subject name in the result
  }));
  
  // Top performers
  const topPerformers = studentSgpaDetails
    .sort((a, b) => b.sgpa - a.sgpa)
    .slice(0, 6)
    .map(student => {
      const studentRecords = records.filter(record => record.REGNO === student.id && record.GR in gradePointMap);
      const bestGrade = studentRecords.length > 0 ? 
        studentRecords.sort((a, b) => (gradePointMap[b.GR] || 0) - (gradePointMap[a.GR] || 0))[0].GR : 'A';
      return {
        id: student.id,
        sgpa: student.sgpa,
        grade: bestGrade,
      };
    });
  
  // Needs improvement
  const needsImprovement: { id: string; sgpa: number; subjects: string }[] = studentSgpaDetails
    .filter(student => student.sgpa < 6.5 || student.hasArrears)
    .map(student => ({
      id: student.id,
      sgpa: student.sgpa,
      subjects: hasArrears(records, student.id) ? getSubjectsWithArrears(records, student.id) : '',
    }));
  
  // Pass/Fail data
  const passCount = records.filter(record => record.GR in gradePointMap && record.GR !== 'U').length;
  const failCount = records.filter(record => record.GR === 'U').length;
  const totalValidGrades = passCount + failCount;
  
  const passPercentage = totalValidGrades > 0 ? formatTo2Decimals((passCount / totalValidGrades) * 100) : 0;
  const failPercentage = totalValidGrades > 0 ? formatTo2Decimals((failCount / totalValidGrades) * 100) : 0;
  
  const passFailData = [
    { name: 'Pass', value: passPercentage, fill: passFailColors.pass },
    { name: 'Fail', value: failPercentage, fill: passFailColors.fail },
  ];

  // Subject-wise grade distribution
  const subjectGradeDistribution: { [subject: string]: { name: string; count: number; fill: string }[] } = {};
  const uniqueSubjects = [...new Set(recordsForSubjectAnalysis.map(record => record.SCODE))];

  uniqueSubjects.forEach(subject => {
    // Filter out arrear subjects for grade distribution analysis
    const subjectRecords = recordsForSubjectAnalysis.filter(record => record.SCODE === subject);
    const gradeCounts: { [grade: string]: number } = {};

    subjectRecords.forEach(record => {
      // Only count valid grades
      if (record.GR in gradePointMap) {
        gradeCounts[record.GR] = (gradeCounts[record.GR] || 0) + 1;
      }
    });

    subjectGradeDistribution[subject] = Object.entries(gradeCounts).map(([grade, count]) => ({
      name: grade,
      count: count,
      fill: getGradeColor(grade),
    }));
  });
  
  // Classification table calculations - these follow the specified rules
  // For CGPA mode, current semester is the file with highest semester number
  const currentSemesterRecordsForClassification = currentSemesterFile ? fileGroups[currentSemesterFile] : records;
  const currentSemesterStudentSgpaDetails = [...new Set(currentSemesterRecordsForClassification.map(record => record.REGNO))].map(studentId => {
    return studentSgpaDetails.find(detail => detail.id === studentId) || {
      id: studentId,
      sgpa: 0,
      hasArrears: hasArrears(currentSemesterRecordsForClassification, studentId)
    };
  });
  
  const singleFileClassification = calculateSingleFileClassification(currentSemesterRecordsForClassification, currentSemesterStudentSgpaDetails);
  const multipleFileClassification = fileCount > 1 
    ? calculateMultipleFileClassification(records, fileGroups, cgpaAnalysis)
    : singleFileClassification; // Fallback to single file data if no multiple files
  
  return {
    totalStudents,
    averageCGPA,
    highestSGPA,
    lowestSGPA,
    gradeDistribution: gradeDistributionData,
    totalGrades,
    subjectPerformance: subjectPerformanceData,
    topPerformers,
    needsImprovement,
    studentSgpaDetails,
    passFailData,
    subjectGradeDistribution,
    fileCount,
    filesProcessed,
    fileWiseAnalysis,
    cgpaAnalysis,
    singleFileClassification,
    multipleFileClassification,
    currentSemesterFile
  };
};

// Calculate classification data for single file
const calculateSingleFileClassification = (
  records: StudentRecord[],
  studentSgpaDetails: { id: string; sgpa: number; hasArrears: boolean }[]
) => {
  // Initialize counters
  const classification = {
    distinction: 0,
    firstClassWOA: 0, // Without arrears
    firstClassWA: 0,  // With arrears
    secondClassWOA: 0, // Without arrears
    secondClassWA: 0,  // With arrears
    fail: 0,
    totalStudents: studentSgpaDetails.length,
    passPercentage: 0
  };
  
  // Process each student according to the specified rules
  studentSgpaDetails.forEach(student => {
    if (student.hasArrears) {
      // Students with arrears
      if (student.sgpa >= 6.5) {
        classification.firstClassWA++;
      } else if (student.sgpa >= 5.0) {
        classification.secondClassWA++;
      } else {
        classification.fail++;
      }
    } else {
      // Students without arrears
      if (student.sgpa >= 8.5) {
        classification.distinction++;
      } else if (student.sgpa >= 6.5) {
        classification.firstClassWOA++;
      } else {
        classification.secondClassWOA++;
      }
    }
  });
  
  // Count U grades for fail column
  const failGradeCount = records.filter(record => record.GR === 'U').length;
  classification.fail = failGradeCount;
  
  // Calculate pass percentage
  const totalGrades = records.length;
  const passGrades = records.filter(record => record.GR !== 'U').length;
  
  classification.passPercentage = totalGrades > 0 ? 
    formatTo2Decimals((passGrades / totalGrades) * 100) : 0;
  
  return classification;
};

// Calculate classification data for multiple files
const calculateMultipleFileClassification = (
  records: StudentRecord[],
  fileGroups: { [fileName: string]: StudentRecord[] },
  cgpaAnalysis?: {
    studentCGPAs: { id: string; cgpa: number }[];
    averageCGPA: number;
    highestCGPA: number;
    lowestCGPA: number;
    currentSemesterFile?: string;
  }
) => {
  // Initialize counters
  const classification = {
    distinction: 0,
    firstClassWOA: 0,
    firstClassWA: 0,
    secondClassWOA: 0,
    secondClassWA: 0,
    fail: 0,
    totalStudents: 0,
    passPercentage: 0
  };
  
  // Get unique student IDs
  const studentIds = [...new Set(records.map(record => record.REGNO))];
  classification.totalStudents = studentIds.length;
  
  // Process each student according to the specified rules for multiple files
  studentIds.forEach(studentId => {
    // Check if student has arrears in ANY semester
    const hasArrearsInAnySemester = Object.keys(fileGroups).some(fileName => {
      const fileRecords = fileGroups[fileName];
      return hasArrears(fileRecords, studentId);
    });
    
    // Get student's CGPA
    const cgpaInfo = cgpaAnalysis?.studentCGPAs.find(s => s.id === studentId);
    const cgpa = cgpaInfo?.cgpa || 0;
    
    if (hasArrearsInAnySemester) {
      // Students with arrears in any semester
      if (cgpa >= 6.5) {
        classification.firstClassWA++;
      } else if (cgpa >= 5.0) {
        classification.secondClassWA++;
      } else {
        classification.fail++;
      }
    } else {
      // Students without arrears in any semester
      if (cgpa >= 8.5) {
        classification.distinction++;
      } else if (cgpa >= 6.5) {
        classification.firstClassWOA++;
      } else {
        classification.secondClassWOA++;
      }
    }
  });
  
  // Count U grades across all semesters for fail column
  const failGradeCount = records.filter(record => record.GR === 'U').length;
  classification.fail = failGradeCount;
  
  // Calculate overall pass percentage across all semesters
  const totalGrades = records.length;
  const passGrades = records.filter(record => record.GR !== 'U').length;
  
  classification.passPercentage = totalGrades > 0 ? 
    formatTo2Decimals((passGrades / totalGrades) * 100) : 0;
  
  return classification;
};
