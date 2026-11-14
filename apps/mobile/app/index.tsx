import { StyleSheet, Text, View } from "react-native";

export default function Index() {
  return (
    <View style={styles.box}>
      <Text style={styles.title}>Classroom Reservations</Text>
      <Text>Mobile app skeleton. Shares types and API client with the web app.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  title: { fontSize: 20, fontWeight: "600", marginBottom: 12 },
});
