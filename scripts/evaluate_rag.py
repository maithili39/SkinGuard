import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import os
from app.llm import ask, build_ingredient_context, is_available

TEST_CASES = [
    {
        "product": "Retinol Resurfacing Serum",
        "ingredients": [
            {
                "matched_name": "Retinol",
                "explanation": "A derivative of Vitamin A that helps promote cell turnover.",
                "ingredient": {"function": "anti-ageing", "comedogenic": False, "irritant": "yes"}
            },
            {
                "matched_name": "Glycerin",
                "explanation": "A gentle humectant that draws moisture into the skin.",
                "ingredient": {"function": "solvent", "comedogenic": False, "irritant": "no"}
            }
        ],
        "question": "Is this product safe to use during pregnancy?",
        "expected": ["pregnancy", "retinol", "not recommended", "medical advice"],
        "forbidden": ["benzoyl peroxide", "salicylic acid", "hydroquinone"],
        "mock_response": (
            "Based on the provided ingredient data, this product contains Retinol, which is not recommended "
            "during pregnancy. Please consult a doctor or dermatologist for personal medical advice."
        )
    },
    {
        "product": "Acne Clearing Gel",
        "ingredients": [
            {
                "matched_name": "Benzoyl Peroxide",
                "explanation": "An antibacterial agent used to treat acne.",
                "ingredient": {"function": "active", "comedogenic": False, "irritant": "yes"}
            },
            {
                "matched_name": "Water",
                "explanation": "A solvent and carrier.",
                "ingredient": {"function": "solvent", "comedogenic": False, "irritant": "no"}
            }
        ],
        "question": "Can I layer this with a Retinol serum?",
        "expected": ["benzoyl peroxide", "retinol", "deactivate", "oxidize", "irritation"],
        "forbidden": ["niacinamide", "hyaluronic acid", "ceramides"],
        "mock_response": (
            "Benzoyl Peroxide can oxidize and deactivate Retinol if applied at the same time, leading to "
            "increased skin irritation. It is recommended to use them at different times or check with a doctor."
        )
    },
    {
        "product": "Matte Finish Toner",
        "ingredients": [
            {
                "matched_name": "Alcohol Denat",
                "explanation": "A drying solvent used to reduce oiliness.",
                "ingredient": {"function": "solvent", "comedogenic": False, "irritant": "yes"}
            },
            {
                "matched_name": "Salicylic Acid",
                "explanation": "A beta hydroxy acid that exfoliates pores.",
                "ingredient": {"function": "exfoliant", "comedogenic": False, "irritant": "yes"}
            }
        ],
        "question": "Is this product suitable for sensitive skin or rosacea?",
        "expected": ["alcohol denat", "salicylic acid", "drying", "irrit", "rosacea"],
        "forbidden": ["retinol", "bakuchiol", "benzoyl peroxide"],
        "mock_response": (
            "This product contains Alcohol Denat, a drying solvent, and Salicylic Acid, an exfoliant. "
            "Both are known irritants that can disrupt the skin barrier, making them unsuitable for sensitive skin or rosacea."
        )
    }
]

def main():
    print("Starting RAG Groundedness & Faithfulness Evaluation...")
    llm_ok = is_available()
    if llm_ok:
        print("  Gemini API is active. Running live evaluation against gemini-2.5-pro...")
    else:
        print("  GEMINI_API_KEY is not configured. Running in SIMULATED/MOCK mode for testing...")

    passed = 0
    total = len(TEST_CASES)

    print("\n## RAG Evaluation Results\n")
    print("| Product | Question | Live LLM? | Faithfulness Pass | Correctness Pass | Status |")
    print("|---------|----------|-----------|-------------------|------------------|--------|")

    for tc in TEST_CASES:
        context = f"Product: {tc['product']}\n\n" + build_ingredient_context(tc["ingredients"])
        
        if llm_ok:
            answer, source = ask(tc["question"], context)
        else:
            answer = tc["mock_response"]
            source = "mocked"

        answer_lower = answer.lower()

        # 1. Faithfulness Check: Answer should NOT mention any of the forbidden keywords (which aren't in context)
        faithfulness_pass = True
        for fk in tc["forbidden"]:
            if fk in answer_lower:
                faithfulness_pass = False
                break

        # 2. Correctness Check: Answer should mention expected keywords based on the query and context
        correctness_pass = True
        for ek in tc["expected"]:
            if ek not in answer_lower:
                correctness_pass = False
                break

        status = "PASS" if (faithfulness_pass and correctness_pass) else "FAIL"
        if faithfulness_pass and correctness_pass:
            passed += 1

        print(
            f"| {tc['product']:<25} "
            f"| {tc['question']:<40} "
            f"| {str(llm_ok):<9} "
            f"| {str(faithfulness_pass):<17} "
            f"| {str(correctness_pass):<16} "
            f"| {status:<6} |"
        )
        
        if not (faithfulness_pass and correctness_pass):
            print(f"\n  [DEBUG] Failed case details:")
            print(f"    Answer: {answer}")
            print(f"    Expected missing: {[ek for ek in tc['expected'] if ek not in answer_lower]}")
            print(f"    Forbidden found: {[fk for fk in tc['forbidden'] if fk in answer_lower]}\n")

    print(f"\nRAG Evaluation Summary: {passed}/{total} passed.")
    if passed < total:
        sys.exit(1)

if __name__ == "__main__":
    main()
